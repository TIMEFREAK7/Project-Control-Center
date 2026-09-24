package com.pcc.projectcontrolcenter.mirror;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * Lets the user pick the folder their sync tool (e.g. Syncthing) delivers pcc-mirror.json
 * into, via Android's Storage Access Framework, and reads that one file from it.
 *
 * Replaces the old fixed-path read (Filesystem plugin, Documents/PCC-Mirror/pcc-mirror.json):
 * on Android 11+ scoped storage, an app with no storage permission can't read a non-media
 * file another app wrote into shared Documents, so that path could never see a file
 * Syncthing delivered. A folder the user picks here comes with a persistable read grant
 * that survives restarts; no storage permission is needed in the manifest.
 *
 * Read-only on purpose: only FLAG_GRANT_READ_URI_PERMISSION is requested and kept.
 */
@CapacitorPlugin(name = "MirrorFolder")
public class MirrorFolderPlugin extends Plugin {

    private static final String PREFS = "pcc_mirror_folder";
    private static final String KEY_TREE_URI = "tree_uri";
    private static final String MIRROR_FILENAME = "pcc-mirror.json";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Activity.MODE_PRIVATE);
    }

    private Uri storedTree() {
        String s = prefs().getString(KEY_TREE_URI, null);
        return s == null ? null : Uri.parse(s);
    }

    private boolean hasReadGrant(Uri tree) {
        for (UriPermission p : getContext().getContentResolver().getPersistedUriPermissions()) {
            if (p.getUri().equals(tree) && p.isReadPermission()) return true;
        }
        return false;
    }

    private String folderName(Uri tree) {
        Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        try (Cursor c = getContext().getContentResolver().query(doc, new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getString(0);
        } catch (Exception ignored) {}
        return tree.getLastPathSegment();
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "pickFolderResult");
    }

    @ActivityCallback
    private void pickFolderResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject r = new JSObject();
            r.put("picked", false);
            call.resolve(r);
            return;
        }
        Uri tree = data.getData();
        ContentResolver cr = getContext().getContentResolver();
        try {
            cr.takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException e) {
            call.reject("Couldn't keep access to that folder: " + e.getMessage());
            return;
        }
        Uri previous = storedTree();
        if (previous != null && !previous.equals(tree)) {
            try {
                cr.releasePersistableUriPermission(previous, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Exception ignored) {}
        }
        prefs().edit().putString(KEY_TREE_URI, tree.toString()).apply();
        JSObject r = new JSObject();
        r.put("picked", true);
        r.put("folderName", folderName(tree));
        call.resolve(r);
    }

    /**
     * Resolves {status, folderName?, mtime?, data?}. status is one of:
     * "no-folder" (never picked), "no-permission" (grant revoked, pick again),
     * "not-found" (folder has no pcc-mirror.json yet), "unchanged" (mtime <= ifNewerThan),
     * "ok" (data holds the file's text).
     */
    @PluginMethod
    public void readMirror(PluginCall call) {
        Uri tree = storedTree();
        JSObject r = new JSObject();
        if (tree == null) {
            r.put("status", "no-folder");
            call.resolve(r);
            return;
        }
        if (!hasReadGrant(tree)) {
            r.put("status", "no-permission");
            call.resolve(r);
            return;
        }
        r.put("folderName", folderName(tree));
        ContentResolver cr = getContext().getContentResolver();
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        String docId = null;
        long mtime = 0;
        try (
            Cursor c = cr.query(
                children,
                new String[] {
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_LAST_MODIFIED
                },
                null,
                null,
                null
            )
        ) {
            while (c != null && c.moveToNext()) {
                if (MIRROR_FILENAME.equals(c.getString(1))) {
                    docId = c.getString(0);
                    mtime = c.isNull(2) ? 0 : c.getLong(2);
                    break;
                }
            }
        } catch (Exception e) {
            call.reject("Couldn't list the mirror folder: " + e.getMessage());
            return;
        }
        if (docId == null) {
            r.put("status", "not-found");
            call.resolve(r);
            return;
        }
        r.put("mtime", mtime);
        Long ifNewerThan = call.getLong("ifNewerThan");
        if (ifNewerThan != null && mtime != 0 && mtime <= ifNewerThan) {
            r.put("status", "unchanged");
            call.resolve(r);
            return;
        }
        Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, docId);
        try (InputStream in = cr.openInputStream(doc)) {
            if (in == null) throw new Exception("no stream");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            r.put("status", "ok");
            r.put("data", new String(out.toByteArray(), StandardCharsets.UTF_8));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Couldn't read " + MIRROR_FILENAME + ": " + e.getMessage());
        }
    }
}
