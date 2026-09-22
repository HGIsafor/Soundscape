const { app, BrowserWindow } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 41731;

const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

let server;

function startServer() {
  const distPath = path.join(__dirname, "..", "dist");

  server = http.createServer((req, res) => {
    let requestedPath = decodeURIComponent(
      (req.url || "/").split("?")[0]
    );

    if (requestedPath === "/") {
      requestedPath = "/index.html";
    }

    let filePath = path.join(distPath, requestedPath);

    // Prevent requests escaping the dist directory
    if (!filePath.startsWith(distPath)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (!err && stats.isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }

      fs.readFile(filePath, (readErr, data) => {
        if (readErr) {
          // SPA fallback
          fs.readFile(path.join(distPath, "index.html"), (fallbackErr, fallback) => {
            if (fallbackErr) {
              res.writeHead(404);
              res.end("Not found");
              return;
            }

            res.writeHead(200, {
              "Content-Type": "text/html",
            });
            res.end(fallback);
          });

          return;
        }

        const extension = path.extname(filePath).toLowerCase();

        res.writeHead(200, {
          "Content-Type": mimeTypes[extension] || "application/octet-stream",
        });

        res.end(data);
      });
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);

    server.listen(PORT, "127.0.0.1", () => {
      resolve();
    });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 400,
    minHeight: 600,
    title: "BT Turntable",
    autoHideMenuBar: true,

    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.loadURL(`http://127.0.0.1:${PORT}`);
}

app.whenReady().then(async () => {
  await startServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (server) {
    server.close();
  }
});
