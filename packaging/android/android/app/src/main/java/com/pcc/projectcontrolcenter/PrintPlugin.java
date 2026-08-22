package com.pcc.projectcontrolcenter;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Native print support for Android — a bare WebView has no window.print() of its own, unlike a
 * real browser or Electron's Chromium. Deliberately not a third-party plugin: WebView's own
 * createPrintDocumentAdapter() + the platform's PrintManager is the same OS-level API Chrome
 * itself uses to print, ships with Android since API 21 (well under this app's minSdkVersion 24),
 * and — the actual point — surfaces the system print dialog, which includes a "Save as PDF"
 * virtual printer on every Android device by default alongside real printers.
 *
 * Print operates on the WebView's own rendering, so the app's existing @media print CSS
 * (styles.css) applies exactly as it does for a desktop Ctrl+P — nothing about the print
 * stylesheet or reports.js/executiveCenter.js needed to change for this to work. See
 * src/js/nativePrint.js for the window.print() shim that calls into this plugin.
 */
@CapacitorPlugin(name = "NativePrint")
public class PrintPlugin extends Plugin {

    @PluginMethod
    public void print(PluginCall call) {
        getBridge()
            .executeOnMainThread(() -> {
                try {
                    WebView webView = getBridge().getWebView();
                    PrintManager printManager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                    String jobName =
                        getContext().getApplicationInfo().loadLabel(getContext().getPackageManager()).toString() + " Document";
                    PrintDocumentAdapter printAdapter = webView.createPrintDocumentAdapter(jobName);
                    printManager.print(jobName, printAdapter, new PrintAttributes.Builder().build());
                    call.resolve();
                } catch (Exception e) {
                    call.reject("Could not start print job: " + e.getMessage());
                }
            });
    }
}
