"use strict";
const path = require("path");
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const main = require("electron-trpc/main");
try {
  electron.contextBridge.exposeInMainWorld("electron", preload.electronAPI);
  electron.contextBridge.exposeInMainWorld("path", path);
} catch (error) {
  console.error(error);
}
process.once("loaded", async () => {
  main.exposeElectronTRPC();
});
