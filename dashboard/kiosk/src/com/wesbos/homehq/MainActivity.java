package com.wesbos.homehq;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.admin.DevicePolicyManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.net.http.SslError;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Full-screen kiosk WebView for the Home HQ wall tablet.
 * - Immersive mode hides the status + navigation bars (true 1280x800).
 * - Controls: hold two fingers still on the screen for 1.5s for launcher/settings/Wi-Fi/reload.
 * - Offline: a failed page load shows a native screen instead of WebView's error page (which
 *   prints the full URL, including any token in it). With no Wi-Fi it offers Wi-Fi settings.
 * - Remote debugging is OFF unless launched with the debug extra (every app on this device
 *   gets root, so the devtools socket should only exist while actively debugging):
 *     adb shell am start -n com.wesbos.homehq/.MainActivity --ez debug true
 * - Launch with a URL: adb shell am start -a android.intent.action.VIEW -d <url> -n com.wesbos.homehq/.MainActivity
 * - Set the saved URL, used on every later launch: adb shell am start -n com.wesbos.homehq/.MainActivity --es url <url>
 * - A site bundled at build time (KIOSK_SITE) is answered at http://127.0.0.1:8765/ from the
 *   APK's assets/site/, with no server; every other URL goes to the network as usual.
 * - Offer the kiosk as a Home app (--ez home false undoes it), then pick it:
 *     adb shell am start -n com.wesbos.homehq/.MainActivity --ez home true
 *     adb shell cmd package set-home-activity com.wesbos.homehq/.Home
 */
public class MainActivity extends Activity {
  static final String TAG = "HomeHQ";
  static final String DEFAULT_URL = "https://home-dashboard.wesbos.workers.dev/";
  static final String PREFS = "kiosk";
  static final String PREF_URL = "url";
  static final long EXIT_HOLD_MS = 1500;
  static final int CANCEL_POINTER_IDS = 10; // touch ids 0-9
  static final long RETRY_MS = 5000;
  static final long STALL_MS = 15000;
  static final long NAV_CHECK_MS = 5000;
  static final long NAV_REBIND_MS = 1000;
  static final float EXIT_SLOP_PX = 60;
  static final String LOCAL_HOST = "127.0.0.1";
  static final int LOCAL_PORT = 8765;
  static final String LOCAL_ASSETS = "site";

  private WebView web;
  private final Handler handler = new Handler(Looper.getMainLooper());
  // Not cleared in onDestroy, so a navigation rebind that has started always finishes.
  private final Handler rebindHandler = new Handler(Looper.getMainLooper());
  private final int[] exitIds = new int[2];
  private final float[] exitX = new float[2];
  private final float[] exitY = new float[2];
  private boolean exitArmed;
  private String retryUrl;
  private String mainUrl;
  private boolean pageFailed;
  // A retry is queued: keep the offline screen up until it runs, even if the failed load "finishes".
  private boolean retryPending;
  private LinearLayout offline;
  private TextView offlineTitle, offlineText;

  private final Runnable retry = new Runnable() {
    @Override
    public void run() {
      retryPending = false;
      if (retryUrl == null) return;
      load(retryUrl);
      // A retry started while Wi-Fi is joining can hang for about a minute with no error and no
      // finish, so no further retry is posted. Start a new one if it is still pending.
      handler.removeCallbacks(stall);
      handler.postDelayed(stall, STALL_MS);
    }
  };

  private final Runnable stall = new Runnable() {
    @Override
    public void run() {
      if (retryUrl == null || offline.getVisibility() != View.VISIBLE) return;
      Log.w(TAG, "Retry still pending after " + STALL_MS + " ms, starting a new one");
      retry.run();
    }
  };

  // On frames that start Wi-Fi after boot, the error screen is up when Wi-Fi connects. Retry then,
  // and correct the "Connect to Wi-Fi?" text, instead of waiting for the next error.
  private final BroadcastReceiver networkChange = new BroadcastReceiver() {
    @Override
    public void onReceive(Context context, Intent intent) {
      if (retryUrl == null || offline.getVisibility() != View.VISIBLE || !wifiConnected()) return;
      Log.i(TAG, "Wi-Fi connected or clock changed, retrying now");
      showOffline();
      handler.removeCallbacks(retry);
      handler.removeCallbacks(stall);
      retryPending = true;
      handler.post(retry);
    }
  };

  private final Runnable showControls = new Runnable() {
    @Override
    public void run() {
      exitArmed = false;
      Log.i(TAG, "Two-finger hold: opening controls");
      cancelPageTouches();
      new AlertDialog.Builder(MainActivity.this)
          .setTitle("Home HQ")
          .setItems(new String[] {"Open launcher", "Android settings", "Wi-Fi settings", "Reload dashboard"},
              (dialog, which) -> {
                if (which == 0) openLauncher();
                else if (which == 1) startActivity(new Intent(Settings.ACTION_SETTINGS));
                else if (which == 2) openWifiSettings();
                else web.reload();
              })
          .setNegativeButton("Back to dashboard", null).show();
    }
  };

  /**
   * What the dashboard page can ask of the kiosk, as window.HomeHQKiosk. Any page shown here can
   * call it, so it only dims the backlight and reports harmless details: no settings, no files.
   */
  class Bridge {
    /** Backlight off (the screen still takes taps) while nobody is home, or back to normal. */
    @JavascriptInterface
    public void setScreenOff(final boolean off) {
      runOnUiThread(() -> MainActivity.this.setScreenOff(off));
    }

    /** Kiosk version, device and Wi-Fi signal (dBm), as JSON, for the frame health list. */
    @JavascriptInterface
    public String info() {
      Integer rssi = null;
      try {
        WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        // Not getNetworkId(): Android 10 hides it (-1) from apps without location permission.
        // getRssi() is -127 when there's no connection.
        int r = wifi != null && wifi.getConnectionInfo() != null ? wifi.getConnectionInfo().getRssi() : -127;
        if (r > -127 && r < 0) rssi = r;
      } catch (RuntimeException e) {
        Log.w(TAG, "Wi-Fi signal unavailable", e);
      }
      String version = "";
      try {
        version = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
      } catch (PackageManager.NameNotFoundException e) {
        // can't happen for our own package
      }
      PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
      return "{\"kiosk\":\"" + version + "\",\"model\":\"" + Build.MODEL.replace("\"", "") + "\",\"android\":\""
          + Build.VERSION.RELEASE + "\",\"rssi\":" + rssi + ",\"sleep\":" + adminActive()
          + ",\"screenOn\":" + (pm == null || pm.isInteractive()) + "}";
    }
  }

  private PowerManager.WakeLock keepAwake;

  private boolean adminActive() {
    DevicePolicyManager dpm = (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);
    return dpm != null && dpm.isAdminActive(new ComponentName(this, ScreenAdmin.class));
  }

  private void setBrightnessOff(boolean off) {
    WindowManager.LayoutParams lp = getWindow().getAttributes();
    lp.screenBrightness = off ? 0f : WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
    getWindow().setAttributes(lp);
  }

  /**
   * Off: with the device admin enabled, the screen goes fully to sleep like the power button
   * (backlight 0), while a partial wake lock keeps the CPU and Wi-Fi running so alerts, check-ins
   * and the page's own clock carry on. Without it, only the backlight goes down to the panel's
   * minimum. On: restore brightness and, if it was asleep, wake it. A touch wakes a sleeping
   * screen by itself; the screen-on receiver then tells the page.
   */
  private void setScreenOff(boolean off) {
    PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
    if (off) {
      if (adminActive()) {
        try {
          if (keepAwake == null) {
            keepAwake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "homehq:screenoff");
            keepAwake.setReferenceCounted(false);
          }
          if (!keepAwake.isHeld()) keepAwake.acquire();
          ((DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE)).lockNow();
          return;
        } catch (RuntimeException e) {
          Log.w(TAG, "Sleep failed, dimming instead", e);
        }
      }
      setBrightnessOff(true);
      return;
    }
    setBrightnessOff(false);
    if (keepAwake != null && keepAwake.isHeld()) keepAwake.release();
    if (pm != null && !pm.isInteractive()) {
      @SuppressWarnings("deprecation")
      PowerManager.WakeLock wake = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK
          | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE, "homehq:wake");
      wake.acquire(3000);
    }
  }

  /** Tells the page the screen came on (a touch or the power button), so it leaves "screen off". */
  private final BroadcastReceiver screenOn = new BroadcastReceiver() {
    @Override
    public void onReceive(Context c, Intent i) {
      if (web != null) web.evaluateJavascript("window.HomeHQScreenOn && window.HomeHQScreenOn()", null);
    }
  };

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    applyDebugFlag(getIntent());
    applyHomeFlag(getIntent());
    keepNavigationEnabled();
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        | WindowManager.LayoutParams.FLAG_FULLSCREEN);

    web = new WebView(this);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setUseWideViewPort(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    web.addJavascriptInterface(new Bridge(), "HomeHQKiosk");
    // Keep navigation inside the kiosk. When the kiosk starts at boot before Wi-Fi is up, the
    // first load fails and would stay on the error page, so retry failed main-frame loads.
    // The offline screen covers WebView's error page until a load succeeds.
    web.setWebViewClient(new WebViewClient() {
      @Override
      public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
        return localAsset(req.getUrl());
      }

      @Override
      public void onPageStarted(WebView view, String url, Bitmap icon) {
        setBrightnessOff(false); // a new page starts lit, whatever the last one asked for
        pageFailed = false;
        mainUrl = url;
      }

      @Override
      public void onPageCommitVisible(WebView view, String url) {
        // The retry reached the server and is drawing; let a slow page finish.
        handler.removeCallbacks(stall);
      }

      @Override
      public void onPageFinished(WebView view, String url) {
        if (!pageFailed && !retryPending) {
          offline.setVisibility(View.GONE);
          handler.removeCallbacks(stall);
        }
      }

      @Override
      @SuppressWarnings("deprecation")
      public void onReceivedError(WebView view, int code, String desc, String failingUrl) {
        Log.w(TAG, "Load failed (" + desc + "), retrying in " + RETRY_MS + " ms");
        pageFailed = true;
        showOffline();
        retryUrl = failingUrl;
        handler.removeCallbacks(retry);
        handler.removeCallbacks(stall);
        retryPending = true;
        handler.postDelayed(retry, RETRY_MS);
      }

      @Override
      public void onReceivedSslError(WebView view, SslErrorHandler h, SslError error) {
        // Never bypass a certificate error. Frames without a clock battery boot with an old date
        // after a power cut, so every certificate looks invalid until network time arrives. Treat
        // it as a failed load and retry the saved page until the clock is right.
        h.cancel();
        // Images and scripts report certificate errors here too. Android 6 doesn't trust every
        // CA, so one such image must not cover a working page; only the page itself counts.
        if (mainUrl != null && !mainUrl.equals(error.getUrl())) {
          Log.w(TAG, "Certificate error " + error.getPrimaryError() + " on a subresource; blocked");
          return;
        }
        Log.w(TAG, "Certificate error " + error.getPrimaryError() + ", retrying in " + RETRY_MS + " ms");
        pageFailed = true;
        showOffline();
        if (error.hasError(SslError.SSL_NOTYETVALID) || error.hasError(SslError.SSL_EXPIRED)
            || error.hasError(SslError.SSL_DATE_INVALID)) {
          offlineTitle.setText("Setting the clock\u2026");
          offlineText.setText("The frame's date is wrong after a power cut. It reloads once the time is set.");
        }
        retryUrl = error.getUrl() != null ? error.getUrl() : savedUrl();
        handler.removeCallbacks(retry);
        handler.removeCallbacks(stall);
        retryPending = true;
        handler.postDelayed(retry, RETRY_MS);
      }
    });
    FrameLayout root = new FrameLayout(this);
    root.addView(web);
    root.addView(buildOffline());
    setContentView(root);

    String url = urlFrom(getIntent());
    load(url != null ? url : savedUrl());
    @SuppressWarnings("deprecation")
    IntentFilter connectivity = new IntentFilter(ConnectivityManager.CONNECTIVITY_ACTION);
    connectivity.addAction(Intent.ACTION_TIME_CHANGED); // network time arrived after a power cut
    registerReceiver(networkChange, connectivity);
    registerReceiver(screenOn, new IntentFilter(Intent.ACTION_SCREEN_ON));
  }

  @Override
  protected void onResume() {
    super.onResume();
    NavigationService.setDashboardVisible(true);
  }

  @Override
  protected void onPause() {
    cancelExit();
    NavigationService.setDashboardVisible(false);
    super.onPause();
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    applyDebugFlag(intent);
    applyHomeFlag(intent);
    String url = urlFrom(intent);
    if (url != null) {
      handler.removeCallbacks(retry);
      handler.removeCallbacks(stall);
      retryPending = false;
      retryUrl = url;
      load(url);
    }
  }

  /** A "url" extra is saved for later launches. A VIEW link from another app is shown, not saved. */
  private String urlFrom(Intent intent) {
    String saved = intent.getStringExtra(PREF_URL);
    if (saved == null) return intent.getDataString();
    // The activity is exported, so only save web URLs: never file:, content: or javascript:.
    String scheme = Uri.parse(saved).getScheme();
    if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) {
      Log.w(TAG, "Ignoring non-web kiosk URL (scheme " + scheme + ")");
      return null;
    }
    getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(PREF_URL, saved).apply();
    Log.i(TAG, "Saved kiosk URL: " + forLog(saved));
    return saved;
  }

  /**
   * The URL without user info, query or fragment, for logcat. Those parts can carry API keys or
   * tokens, and any app with READ_LOGS (or anyone with ADB) can read the log.
   */
  static String forLog(String url) {
    Uri u = Uri.parse(url);
    String port = u.getPort() == -1 ? "" : ":" + u.getPort();
    String path = u.getEncodedPath() == null ? "" : u.getEncodedPath();
    boolean hidden = u.getEncodedUserInfo() != null || u.getEncodedQuery() != null
        || u.getEncodedFragment() != null;
    return u.getScheme() + "://" + u.getHost() + port + path + (hidden ? " (query, fragment or user info not logged)" : "");
  }

  // Some WebViews report the page's certificate error before onPageStarted, so remember the
  // page here too.
  private void load(String url) {
    mainUrl = url;
    web.loadUrl(url);
  }

  private String savedUrl() {
    return getSharedPreferences(PREFS, MODE_PRIVATE).getString(PREF_URL, DEFAULT_URL);
  }

  /**
   * Answers http://127.0.0.1:8765/<path> from assets/site/<path> (bundled by build.sh from
   * KIOSK_SITE). Any other URL returns null and goes to the network as usual. Nothing listens on
   * the port; only this WebView sees these responses. Paths ending in / get index.html.
   */
  private WebResourceResponse localAsset(Uri u) {
    if (u == null || !"http".equalsIgnoreCase(u.getScheme()) || !LOCAL_HOST.equals(u.getHost())
        || u.getPort() != LOCAL_PORT) return null;
    String path = u.getPath();
    if (path == null || path.isEmpty()) path = "/";
    if (path.endsWith("/")) path += "index.html";
    Map<String, String> headers = new HashMap<>();
    headers.put("Cache-Control", "no-cache");
    if (path.contains("..") || path.contains("//")) {
      return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers, null);
    }
    try {
      InputStream in = getAssets().open(LOCAL_ASSETS + path);
      return new WebResourceResponse(mimeFor(path), "utf-8", 200, "OK", headers, in);
    } catch (IOException e) {
      Log.w(TAG, "No bundled file for " + path);
      return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers, null);
    }
  }

  static String mimeFor(String path) {
    String p = path.toLowerCase(Locale.ROOT);
    if (p.endsWith(".html") || p.endsWith(".htm")) return "text/html";
    if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
    if (p.endsWith(".css")) return "text/css";
    if (p.endsWith(".json")) return "application/json";
    if (p.endsWith(".svg")) return "image/svg+xml";
    if (p.endsWith(".png")) return "image/png";
    if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
    if (p.endsWith(".webp")) return "image/webp";
    if (p.endsWith(".gif")) return "image/gif";
    if (p.endsWith(".woff2")) return "font/woff2";
    if (p.endsWith(".txt")) return "text/plain";
    return "application/octet-stream";
  }

  private int dp(float v) {
    return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
  }

  private View buildOffline() {
    offline = new LinearLayout(this);
    offline.setOrientation(LinearLayout.VERTICAL);
    offline.setGravity(Gravity.CENTER);
    offline.setBackgroundColor(Color.rgb(17, 17, 17));
    offline.setVisibility(View.GONE);
    offline.setClickable(true); // keep taps off the error page underneath

    offlineTitle = new TextView(this);
    offlineTitle.setTextColor(Color.WHITE);
    offlineTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 40);
    offlineTitle.setGravity(Gravity.CENTER);
    offline.addView(offlineTitle);

    offlineText = new TextView(this);
    offlineText.setTextColor(Color.rgb(170, 170, 170));
    offlineText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
    offlineText.setGravity(Gravity.CENTER);
    offlineText.setPadding(dp(24), dp(12), dp(24), dp(28));
    offline.addView(offlineText);

    Button wifi = new Button(this);
    wifi.setText("Open Wi-Fi settings");
    wifi.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
    wifi.setPadding(dp(32), dp(16), dp(32), dp(16));
    wifi.setOnClickListener(v -> openWifiSettings());
    offline.addView(wifi, new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
    return offline;
  }

  private boolean wifiConnected() {
    ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
    @SuppressWarnings("deprecation")
    NetworkInfo n = cm != null ? cm.getNetworkInfo(ConnectivityManager.TYPE_WIFI) : null;
    return n != null && n.isConnected();
  }

  private void showOffline() {
    if (wifiConnected()) {
      offlineTitle.setText("Can't reach the dashboard");
      offlineText.setText("Wi-Fi is connected. Retrying every few seconds.");
    } else {
      offlineTitle.setText("Connect to Wi-Fi?");
      offlineText.setText("The frame isn't on Wi-Fi. The dashboard comes back by itself once it is.");
    }
    offline.setVisibility(View.VISIBLE);
  }

  private void openWifiSettings() {
    try {
      startActivity(new Intent(Settings.ACTION_WIFI_SETTINGS));
    } catch (Exception e) {
      Log.w(TAG, "No Wi-Fi settings screen, opening Settings", e);
      startActivity(new Intent(Settings.ACTION_SETTINGS));
    }
  }

  /**
   * Some frames (PF1007L) run a vendor BackgroundManagerService that drops the navigation service
   * after the kiosk is updated or force-stopped, leaving no way back from Settings. If the owner
   * opted in by granting WRITE_SECURE_SETTINGS, put the service back on the enabled list:
   *   adb shell pm grant com.wesbos.homehq android.permission.WRITE_SECURE_SETTINGS
   * Android 6 also leaves the service listed but unbound after the kiosk's process is killed (the
   * Denver PFF-1015's low-RAM mode kills it on every app switch), so rebind it if it isn't running.
   */
  private void keepNavigationEnabled() {
    if (checkSelfPermission("android.permission.WRITE_SECURE_SETTINGS") != PackageManager.PERMISSION_GRANTED) return;
    String cur = Settings.Secure.getString(getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
    String others = withoutNavigation(cur);
    if (!isNavigationListed(cur)) {
      setNavigationServices(others.isEmpty() ? navigationService() : others + ":" + navigationService());
      Log.i(TAG, "Re-enabled navigation service");
      return;
    }
    // Some firmware keeps the selected service but resets only the master switch at boot.
    int enabled = Settings.Secure.getInt(getContentResolver(), Settings.Secure.ACCESSIBILITY_ENABLED, 0);
    if (enabled != 1) {
      setAccessibilityEnabled();
      return;
    }
    handler.postDelayed(() -> {
      if (NavigationService.isConnected()) return;
      // Writing the same list doesn't notify Android, so take the service off and put it back.
      setNavigationServices(others);
      rebindHandler.postDelayed(() -> setNavigationServices(cur), NAV_REBIND_MS);
      Log.i(TAG, "Navigation service listed but not running, rebinding");
    }, NAV_CHECK_MS);
  }

  private String navigationService() {
    return getPackageName() + "/" + NavigationService.class.getName();
  }

  private boolean isNavigationEntry(String entry) {
    return new ComponentName(this, NavigationService.class).equals(ComponentName.unflattenFromString(entry));
  }

  private boolean isNavigationListed(String services) {
    if (services == null) return false;
    for (String entry : services.split(":")) {
      if (isNavigationEntry(entry)) return true;
    }
    return false;
  }

  /** The enabled services list without the navigation service. */
  private String withoutNavigation(String services) {
    if (services == null) return "";
    StringBuilder rest = new StringBuilder();
    for (String entry : services.split(":")) {
      if (entry.isEmpty() || isNavigationEntry(entry)) continue;
      if (rest.length() > 0) rest.append(':');
      rest.append(entry);
    }
    return rest.toString();
  }

  private void setNavigationServices(String services) {
    try {
      Settings.Secure.putString(getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, services);
      if (Settings.Secure.getInt(getContentResolver(), Settings.Secure.ACCESSIBILITY_ENABLED, 0) != 1) {
        Settings.Secure.putString(getContentResolver(), Settings.Secure.ACCESSIBILITY_ENABLED, "1");
      }
    } catch (SecurityException e) {
      Log.w(TAG, "Could not update navigation service", e);
    }
  }

  /** Master switch only: a correct services list is left untouched. */
  private void setAccessibilityEnabled() {
    try {
      Settings.Secure.putString(getContentResolver(), Settings.Secure.ACCESSIBILITY_ENABLED, "1");
    } catch (SecurityException e) {
      Log.w(TAG, "Could not update accessibility master switch", e);
    }
  }

  private void openLauncher() {
    Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
    for (ResolveInfo info : getPackageManager().queryIntentActivities(home, 0)) {
      String pkg = info.activityInfo.packageName;
      if (pkg.equals(getPackageName()) || pkg.equals("com.android.settings")) continue;
      startActivity(new Intent(home).setComponent(new ComponentName(pkg, info.activityInfo.name)));
      return;
    }
    startActivity(new Intent(Settings.ACTION_SETTINGS));
  }

  @Override
  protected void onDestroy() {
    unregisterReceiver(networkChange);
    unregisterReceiver(screenOn);
    if (keepAwake != null && keepAwake.isHeld()) keepAwake.release();
    handler.removeCallbacksAndMessages(null);
    if (web != null) web.destroy();
    super.onDestroy();
  }

  /** Remote debugging only when explicitly requested; any normal launch turns it back off. */
  private void applyDebugFlag(Intent intent) {
    boolean debug = intent != null && intent.getBooleanExtra("debug", false);
    WebView.setWebContentsDebuggingEnabled(debug);
    Log.i(TAG, "WebView remote debugging " + (debug ? "ON" : "off"));
  }

  /** Turns the Home alias on or off. The shell can't enable a component of a release app. */
  private void applyHomeFlag(Intent intent) {
    if (intent == null || !intent.hasExtra("home")) return;
    boolean home = intent.getBooleanExtra("home", false);
    getPackageManager().setComponentEnabledSetting(new ComponentName(this, getPackageName() + ".Home"),
        home ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DEFAULT,
        PackageManager.DONT_KILL_APP);
    Log.i(TAG, "Home alias " + (home ? "on" : "off"));
  }

  /** Watches for the two-finger exit hold; all touches still go to the page (after a stale-touch reset). */
  @Override
  public boolean dispatchTouchEvent(MotionEvent e) {
    switch (e.getActionMasked()) {
      case MotionEvent.ACTION_DOWN:
        // Android sends DOWN only when every earlier finger has lifted. If the page still holds a
        // touch from before (see cancelPageTouches), clear it first so this tap is not read as a
        // second finger. With no stale touch the cancel is a no-op.
        cancelPageTouches();
        break;
      case MotionEvent.ACTION_POINTER_DOWN:
        if (e.getPointerCount() == 2) {
          for (int i = 0; i < 2; i++) {
            exitIds[i] = e.getPointerId(i);
            exitX[i] = e.getX(i);
            exitY[i] = e.getY(i);
          }
          exitArmed = true;
          handler.removeCallbacks(showControls);
          handler.postDelayed(showControls, EXIT_HOLD_MS);
        } else {
          cancelExit(); // 3+ fingers
        }
        break;
      case MotionEvent.ACTION_MOVE:
        if (exitArmed) {
          for (int i = 0; i < 2; i++) {
            int idx = e.findPointerIndex(exitIds[i]);
            if (idx < 0 || Math.hypot(e.getX(idx) - exitX[i], e.getY(idx) - exitY[i]) > EXIT_SLOP_PX) {
              cancelExit();
              break;
            }
          }
        }
        break;
      case MotionEvent.ACTION_POINTER_UP:
      case MotionEvent.ACTION_UP:
      case MotionEvent.ACTION_CANCEL:
        cancelExit();
        break;
      default:
        break;
    }
    return super.dispatchTouchEvent(e);
  }

  private void cancelExit() {
    if (!exitArmed) return;
    exitArmed = false;
    handler.removeCallbacks(showControls);
  }

  /**
   * Ends any touch the page thinks is still down. On a PF1007L (2026-10-16) the WebView sometimes
   * kept one touch "down" for good after the two-finger controls opened (not every time), while
   * Android reported no touch at all. Every later tap then arrived as a second finger and the page
   * ignored it (no pointerdown). A cancel resets the page's touch state; with no touch active it
   * does nothing.
   */
  private void cancelPageTouches() {
    if (web == null) return;
    // The stuck touch was pointer id 1 (the second finger of the hold), so a single-pointer cancel
    // (id 0) left it in place. Name every id the panel can use; the page ignores ids it isn't holding.
    MotionEvent.PointerProperties[] props = new MotionEvent.PointerProperties[CANCEL_POINTER_IDS];
    MotionEvent.PointerCoords[] coords = new MotionEvent.PointerCoords[CANCEL_POINTER_IDS];
    for (int i = 0; i < CANCEL_POINTER_IDS; i++) {
      props[i] = new MotionEvent.PointerProperties();
      props[i].id = i;
      props[i].toolType = MotionEvent.TOOL_TYPE_FINGER;
      coords[i] = new MotionEvent.PointerCoords();
    }
    long now = SystemClock.uptimeMillis();
    MotionEvent cancel = MotionEvent.obtain(now, now, MotionEvent.ACTION_CANCEL, CANCEL_POINTER_IDS,
        props, coords, 0, 0, 1f, 1f, 0, 0, InputDevice.SOURCE_TOUCHSCREEN, 0);
    web.dispatchTouchEvent(cancel);
    cancel.recycle();
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) hideSystemUi();
    else cancelPageTouches(); // a dialog or another app took over mid-touch
  }

  private void hideSystemUi() {
    getWindow().getDecorView().setSystemUiVisibility(
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
  }

  @Override
  public void onBackPressed() {
    if (web.canGoBack()) web.goBack();
  }
}
