"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const path = require("path");
const electron = require("electron");
const utils = require("@electron-toolkit/utils");
const main = require("electron-trpc/main");
const fs = require("fs-extra");
const zod = require("zod");
const path$1 = require("node:path");
const node_child_process = require("node:child_process");
const os = require("node:os");
const fetch = require("node-fetch");
const yauzl = require("yauzl-promise");
const electronUpdater = require("electron-updater");
const logger = require("electron-log");
const server = require("@trpc/server");
const superjson = require("superjson");
const child_process = require("child_process");
const observable = require("@trpc/server/observable");
const icon = path.join(__dirname, "./chunks/icon-68f52a3b.png");
const f = {
  boolean: (defaultValue) => zod.z.boolean().nullish().default(!!defaultValue),
  number: (defaultValue, val) => zod.z.preprocess(
    (v) => v === "" || v === void 0 ? defaultValue ?? null : typeof v === "string" ? Number(v) : v,
    (val?.(zod.z.number()) ?? zod.z.number()).nullish()
  )
};
const PreferencesSchema = zod.z.object({
  isPortable: zod.z.boolean().optional(),
  clientDir: zod.z.string().optional(),
  reopenLauncher: f.boolean(),
  cleanWdb: f.boolean(true),
  rememberPosition: f.boolean(),
  windowPosition: zod.z.object({
    x: zod.z.number(),
    y: zod.z.number(),
    width: zod.z.number(),
    height: zod.z.number()
  }).nullish(),
  plusEnabled: f.boolean(false),
  optionalPatches: zod.z.array(zod.z.string()).default([])
});
const isNotUndef = (obj) => obj !== void 0;
const formatFileSize = (bytes) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
};
const formatDuration = (remaining) => {
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor(remaining % 3600 / 60);
  const seconds = Math.floor(remaining % 60);
  return `${hours ? `${hours}h ` : ""}${minutes ? `${minutes}m ` : ""}${seconds}s`;
};
const omit = (obj, keys) => {
  const result = { ...obj };
  keys.forEach((key) => {
    delete result[key];
  });
  return result;
};
const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
class Preferences {
  static #data;
  static userDataDir = process.env.PORTABLE_EXECUTABLE_DIR ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, ".launcher") : electron.app.getPath("userData");
  static async load() {
    const userDataPath = path.join(this.userDataDir, "settings.json");
    try {
      const json = await fs.readJSON(userDataPath);
      return PreferencesSchema.parse({
        ...json,
        isPortable: !!portableDir,
        clientDir: portableDir ?? json.clientDir
      });
    } catch (e) {
      return PreferencesSchema.parse({
        isPortable: !!portableDir,
        clientDir: portableDir
      });
    }
  }
  static get data() {
    return this.#data;
  }
  static set data(newData) {
    this.#data = { ...this.#data, ...newData };
    fs.writeJSON(
      path.join(this.userDataDir, "settings.json"),
      omit(
        this.#data,
        portableDir ? ["isPortable", "clientDir"] : ["isPortable"]
      ),
      { spaces: 2 }
    );
  }
  static async isValidClientDir(clientDir) {
    return !!clientDir && await fs.exists(path.join(clientDir, "WoW.exe"));
  }
}
const FileMap = {
  ["addons"]: { extractPath: "Interface/Addons" },
  ["patch-enUS-7"]: { extractPath: "Data/enUS" },
  ["patch-enUS-8"]: { extractPath: "Data/enUS", plus: true },
  ["hd-creatures"]: {
    extractPath: "Data",
    optional: true,
    label: "HD Creatures",
    description: "Higher resolution retail creature models"
  },
  ["hd-textures"]: {
    extractPath: "Data",
    optional: true,
    label: "HD Textures",
    description: "Higher resolution retail textures"
  },
  ["hd-spells"]: {
    extractPath: "Data",
    optional: true,
    label: "HD Spells",
    description: "Higher resolution retail spell visuals"
  },
  ["hd-bgs"]: {
    extractPath: "Data",
    optional: true,
    label: "HD Battlegrounds",
    description: "Higher detail retail battleground maps"
  },
  ["hd-misc"]: {
    extractPath: "Data",
    optional: true,
    label: "HD Interface",
    description: "Shadowlands style user interface"
  }
};
const pad = (v, p = 2) => v.toString().padStart(p, "0");
const getFormattedTime = (date = /* @__PURE__ */ new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
  date.getDate()
)}-${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(
  date.getSeconds()
)}`;
class Logger {
  static #history = [];
  static #messageToString = ({ message, type, time, obj }) => {
    const objString = obj ? `
${obj instanceof Error ? obj.stack : JSON.stringify(obj, null, 2)}` : "";
    return `[${type}][${time}]: ${message}${objString}`;
  };
  static async log(message, type, obj) {
    const newMessage = {
      message,
      type: type ?? "info",
      time: (/* @__PURE__ */ new Date()).toLocaleTimeString(),
      obj
    };
    console.log(this.#messageToString(newMessage));
    this.#history.push(newMessage);
  }
  static async saveLog() {
    const files = await fs.readdir(Preferences.userDataDir);
    for (const file of files.filter((f2) => f2.startsWith("log-")).slice(0, -4)) {
      await fs.remove(path.join(Preferences.userDataDir, file));
    }
    await fs.writeFile(
      path.join(Preferences.userDataDir, `log-${getFormattedTime()}.txt`),
      this.#history.map(this.#messageToString).join("\n")
    );
  }
}
class Observable {
  _listeners = [];
  _notifyObservers(v = this._value) {
    this._listeners.forEach((l) => l(v));
  }
  observe() {
    return observable.observable((e) => {
      e.next(this._value);
      this._listeners.push(e.next);
      return () => {
        this._listeners.filter((v) => v !== e.next);
      };
    });
  }
  clearObservers() {
    this._listeners = [];
  }
}
const throttle = (ms, fn) => {
  if (ms === 0)
    return fn;
  let last = 0;
  return () => {
    const now = Date.now();
    if (now - last > ms) {
      last = now;
      fn();
    }
  };
};
const resumableFetch = async (url, downloadPath, callback, options = {}) => {
  if (await fs.exists(downloadPath)) {
    Logger.log(`File "${downloadPath}" already exists. Skipping download.`);
    return;
  }
  const partialPath = `${downloadPath}.partial`;
  const initialPartial = await fs.exists(partialPath) ? (await fs.stat(partialPath)).size : 0;
  let done = 0;
  if (initialPartial) {
    Logger.log(
      `Resuming download of "${downloadPath}" from ${initialPartial} bytes`
    );
  } else {
    Logger.log(`Downloading "${downloadPath}"`);
  }
  const response = await fetch(url, {
    headers: { Range: `bytes=${initialPartial}-` }
  });
  const total = Number(response.headers.get("content-length"));
  const startedAt = Date.now();
  const throttled = throttle(options.throttle ?? 0, () => {
    callback?.({ total, done, initialPartial, startedAt });
  });
  const chunks = [];
  response.body.on("data", (chunk) => {
    done += chunk.length;
    chunks.push(chunk);
    throttled();
  });
  let finished = false;
  let processed = 0;
  response.body.on("end", async () => {
    finished = true;
  });
  while (!finished || processed < chunks.length) {
    if (processed === chunks.length) {
      await new Promise((r) => setTimeout(r, 100));
      continue;
    }
    await fs.appendFile(partialPath, chunks[processed]);
    processed++;
  }
  await fs.rename(partialPath, downloadPath);
  Logger.log(`Downloaded "${downloadPath}"`);
};
logger.transports.file.level = "info";
electronUpdater.autoUpdater.logger = logger;
electronUpdater.autoUpdater.autoDownload = false;
electronUpdater.autoUpdater.disableWebInstaller = true;
const ServerUrl = "http://centurionpvp.com/downloads/";
const execAsync = (commands) => {
  const command = commands[os.platform()];
  if (!command)
    return Promise.resolve(void 0);
  return new Promise((resolve) => {
    node_child_process.exec(command, (error, stdout) => {
      if (error)
        resolve(void 0);
      else
        resolve(stdout);
    });
  });
};
const getAvailableDiskSpace = async (clientPath) => {
  const response = await execAsync({
    win32: `%SYSTEMROOT%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -command "Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{n='Free';e={($_.Free / 1GB)}}"`
  });
  if (!response)
    return Infinity;
  const drive = clientPath?.split(":")[0] ?? "C";
  const space = parseFloat(
    response.split("\n").find((l) => l.trim().startsWith(drive))?.split(/\s+/)?.[1] ?? "0"
  );
  return space * 1024 ** 3;
};
const isGameRunning = async () => {
  const response = await execAsync({
    win32: "%SYSTEMROOT%\\System32\\tasklist.exe"
  });
  if (!response)
    return false;
  return response.toLowerCase().includes("wow.exe");
};
const fetchFile = async (filePath, progressCb) => {
  try {
    await fs.ensureDir(path$1.join(Preferences.userDataDir, "downloads"));
    const downloadPath = path$1.join(
      Preferences.userDataDir,
      "downloads",
      filePath
    );
    await resumableFetch(
      `${ServerUrl}patches/${filePath}`,
      downloadPath,
      progressCb,
      {
        throttle: 500
      }
    );
    return downloadPath;
  } catch (e) {
    Logger.log(`Failed to download ${filePath}`, "error", e);
    throw Error(`Failed to download ${filePath}`);
  }
};
const fetchSize = async (filePath) => {
  try {
    const response = await fetch(`${ServerUrl}patches/${filePath}`, {
      method: "HEAD"
    });
    return parseInt(response.headers.get("content-length") ?? "0");
  } catch (e) {
    Logger.log(`Failed to download ${filePath}`, "error", e);
    throw Error(`Failed to download ${filePath}`);
  }
};
const fetchVersion = async (filePath) => {
  try {
    const response = await fetch(`${ServerUrl}patches/${filePath}`);
    return response.text();
  } catch (e) {
    Logger.log(`Failed to download ${filePath}`, "error", e);
    throw Error(`Failed to download ${filePath}`);
  }
};
class UpdaterClass extends Observable {
  #versionCache = {};
  #fileCache = {};
  #loadCache = async (clientDir) => {
    await fs.ensureDir(path$1.join(clientDir, ".launcher"));
    const versionCache = path$1.join(clientDir, ".launcher", "update-cache.json");
    this.#versionCache = await fs.exists(versionCache) ? await fs.readJSON(versionCache) : {};
    const fileCache = path$1.join(clientDir, ".launcher", "file-cache.json");
    this.#fileCache = await fs.exists(fileCache) ? await fs.readJSON(fileCache) : {};
  };
  #saveCache = async (clientDir) => {
    await fs.ensureDir(path$1.join(clientDir, ".launcher"));
    const versionCache = path$1.join(clientDir, ".launcher", "update-cache.json");
    await fs.writeJSON(versionCache, this.#versionCache, { spaces: 2 });
    const fileCache = path$1.join(clientDir, ".launcher", "file-cache.json");
    await fs.writeJSON(fileCache, this.#fileCache, { spaces: 2 });
  };
  _value = { state: "needsValidation" };
  get status() {
    return this._value;
  }
  set status(v) {
    this._value = v;
    this._notifyObservers(v);
    if (this.status.state === "failed") {
      exports.mainWindow?.setProgressBar(1, { mode: "error" });
    } else if (this.status.progress === 1) {
      exports.mainWindow?.setProgressBar(0);
    } else {
      exports.mainWindow?.setProgressBar(this.status.progress ?? 0, {
        mode: this.status.progress === -1 ? "indeterminate" : "normal"
      });
    }
  }
  invalidate() {
    this.status = { state: "needsValidation" };
  }
  async updateLauncher() {
    const { clientDir, isPortable } = Preferences.data;
    if (!clientDir)
      return;
    Logger.log(`Downloading launcher update...`);
    this.status = {
      state: "updating",
      progress: -1,
      message: `Downloading new launcher...`
    };
    if (isPortable) {
      const newPath = await fetchFile(
        `CenturionLauncher.exe`,
        (p) => {
          const progress = (p.done + p.initialPartial) / (p.total + p.initialPartial);
          const percent = Math.round(progress * 100);
          const elapsed = (Date.now() - p.startedAt) / 1e3;
          const rate = p.done / elapsed;
          const eta = formatDuration(p.total / rate - elapsed);
          this.status = {
            state: "updating",
            progress,
            message: `Downloading launcher update... ${percent}% (${eta} remaining)`
          };
        }
      );
      const scriptPath = path$1.join(clientDir, "update-script.bat");
      const oldPath = path$1.join(clientDir, "CenturionLauncher.exe");
      const updateScript = `
	@echo off
	setlocal
	echo Preparing to update the launcher. Please wait...
	timeout /t 5
	echo Updating the launcher...
	move /y "${newPath}" "${oldPath}"
	echo Update successful! Starting the new launcher...
	start "" "${oldPath}"
	endlocal
		`;
      await fs.writeFile(scriptPath, updateScript);
      Logger.log(`Running update script...`);
      const child = node_child_process.spawn("cmd.exe", ["/c", scriptPath], {
        detached: true,
        stdio: "ignore"
      });
      child.unref();
      electron.app.quit();
    } else {
      electronUpdater.autoUpdater.on(
        "download-progress",
        ({ percent, bytesPerSecond, total, transferred }) => {
          const eta = formatDuration((total - transferred) / bytesPerSecond);
          this.status = {
            state: "updating",
            progress: percent / 100,
            message: `Downloading launcher update... ${percent.toFixed(
              0
            )}% (${eta} remaining)`
          };
        }
      );
      await electronUpdater.autoUpdater.downloadUpdate();
      Logger.log(`Running update script...`);
      electronUpdater.autoUpdater.quitAndInstall();
    }
  }
  async verify() {
    const { clientDir, optionalPatches, plusEnabled, isPortable } = Preferences.data;
    try {
      if (this.status?.state === "verifying" || this.status?.state === "updating")
        return;
      if (!clientDir || !await Preferences.isValidClientDir(clientDir)) {
        this.status = { state: "noClient" };
        return;
      }
      if (isPortable) {
        await fs.remove(path$1.join(clientDir, "update-script.bat"));
        const version = await fetchVersion("latest.yml");
        if (version.match(/version: (.*)/)?.[1] !== electron.app.getVersion()) {
          this.status = { state: "launcherOutdated" };
          return;
        }
      } else {
        try {
          const update = await electronUpdater.autoUpdater.checkForUpdates();
          if (update) {
            this.status = { state: "launcherOutdated" };
            return;
          }
        } catch (e) {
          Logger.log(`Failed to check for launcher updates`, "error", e);
        }
      }
      if (os.platform() === "win32" && clientDir.length > 220) {
        this.status = {
          state: "failed",
          message: "Path to current install location is too long and may cause issues."
        };
        return;
      }
      if (await isGameRunning()) {
        this.status = {
          state: "failed",
          message: "Please close WoW first, before updating."
        };
        return;
      }
      Logger.log(`Verifying client files at ${path$1.join(clientDir)}...`);
      this.status = {
        state: "verifying",
        progress: -1,
        message: "Looking for updates..."
      };
      await this.#loadCache(clientDir);
      let toDownload = 0;
      for (const [name, meta] of Object.entries(FileMap)) {
        const version = await fetchVersion(`${name}.version`);
        const cachePath = path$1.join(
          clientDir,
          ".launcher",
          "cached",
          name,
          version
        );
        if (meta.plus && !plusEnabled || meta.optional && !optionalPatches.includes(name)) {
          if (this.#versionCache[name]) {
            await fs.ensureDir(cachePath);
            for (const file of this.#fileCache[name] ?? []) {
              try {
                await fs.move(
                  path$1.join(clientDir, meta.extractPath, file),
                  path$1.join(cachePath, file)
                );
              } catch (e) {
                console.error(e);
              }
            }
            delete this.#versionCache[name];
          }
          continue;
        }
        if (this.#versionCache[name] === version)
          continue;
        if (await fs.exists(cachePath)) {
          for (const file of this.#fileCache[name] ?? []) {
            try {
              await fs.move(
                path$1.join(cachePath, file),
                path$1.join(clientDir, meta.extractPath, file)
              );
            } catch (e) {
              console.error(e);
            }
          }
          this.#versionCache[name] = version;
          await fs.remove(cachePath);
          continue;
        }
        await fs.remove(path$1.dirname(cachePath));
        Logger.log(`New ${name} version available: ${version}`);
        delete this.#versionCache[name];
        toDownload += await fetchSize(`${name}.zip`);
      }
      await this.#saveCache(clientDir);
      if (toDownload !== 0) {
        const availableSpace = await getAvailableDiskSpace(clientDir);
        if (toDownload > availableSpace) {
          this.status = {
            state: "failed",
            message: `Not enough disk space. Required: ${formatFileSize(
              toDownload
            )}, Available: ${formatFileSize(availableSpace)}`
          };
          return;
        }
      }
      this.status = toDownload !== 0 ? { state: "updateAvailable", message: formatFileSize(toDownload) } : { state: "upToDate", progress: 1 };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unexpected error occurred";
      Logger.log(`Verification failed: ${message}`, "error", e);
      this.status = { state: "failed", message };
    }
  }
  async update(force) {
    const { clientDir, optionalPatches, plusEnabled } = Preferences.data;
    try {
      if (this.status?.state === "verifying" || this.status?.state === "updating")
        return;
      if (!clientDir || !await Preferences.isValidClientDir(clientDir)) {
        this.status = { state: "noClient" };
        return;
      }
      if (await isGameRunning()) {
        this.status = {
          state: "failed",
          message: "Please close WoW first, before updating."
        };
        return;
      }
      if (force) {
        await fs.remove(path$1.join(Preferences.userDataDir, "downloads"));
      }
      Logger.log(`Updating client files at ${path$1.join(clientDir)}...`);
      this.status = {
        state: "updating",
        progress: -1,
        message: "Preparing files..."
      };
      const extractArchive = async (name, file, filePath, shouldCache) => {
        let finished = false;
        const archive = await yauzl.open(file);
        try {
          for await (const entry of archive) {
            Logger.log(`Extracting "${entry.filename}"...`);
            if (entry.filename.endsWith("/")) {
              await fs.ensureDir(path$1.join(filePath, entry.filename));
            } else {
              const dest = path$1.join(filePath, entry.filename);
              await fs.ensureDir(path$1.dirname(dest));
              const readStream = await entry.openReadStream();
              const writeStream = fs.createWriteStream(dest);
              await new Promise((resolve, reject) => {
                readStream.pipe(writeStream);
                writeStream.on("finish", resolve);
                writeStream.on("error", reject);
              });
              if (!shouldCache)
                continue;
              if (!this.#fileCache[name])
                this.#fileCache[name] = [];
              this.#fileCache[name].push(entry.filename);
            }
          }
          finished = true;
        } finally {
          await archive.close();
          if (finished) {
            Logger.log(`Removing "${file}"...`);
            await fs.remove(file);
          }
        }
      };
      for (const [name, meta] of Object.entries(FileMap)) {
        if (meta.plus && !plusEnabled)
          continue;
        if (meta.optional && !optionalPatches.includes(name))
          continue;
        if (this.#versionCache[name] && !force)
          continue;
        Logger.log(`Downloading ${name} files...`);
        const file = await fetchFile(`${name}.zip`, (p) => {
          const progress = (p.done + p.initialPartial) / (p.total + p.initialPartial);
          const percent = Math.round(progress * 100);
          const elapsed = (Date.now() - p.startedAt) / 1e3;
          const rate = p.done / elapsed;
          const eta = formatDuration(p.total / rate - elapsed);
          this.status = {
            state: "updating",
            progress,
            message: `Downloading ${name}... ${percent}% (${eta} remaining)`
          };
        });
        this.status = {
          state: "updating",
          progress: -1,
          message: `Extracting ${name}...`
        };
        await extractArchive(
          name,
          file,
          path$1.join(clientDir, meta.extractPath),
          !!meta.plus || !!meta.optional
        );
        this.#versionCache[name] = await fetchVersion(`${name}.version`);
        await this.#saveCache(clientDir);
      }
      this.status = { state: "upToDate", progress: 1 };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unexpected error occurred";
      Logger.log(`Update failed: ${message}`, "error", e);
      this.status = { state: "failed", message };
    }
  }
}
const Updater = new UpdaterClass();
const t = server.initTRPC.create({
  transformer: superjson,
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    data: {
      ...shape.data,
      zodError: error.cause instanceof zod.ZodError ? error.cause.flatten() : null
    }
  })
});
const createTRPCRouter = t.router;
const publicProcedure = t.procedure;
const patchConfig = async () => {
  const { clientDir, plusEnabled } = Preferences.data;
  if (!clientDir)
    return;
  const exePath = path.join(clientDir, "WoW.exe");
  const buffer = await fs.readFile(exePath);
  buffer.write(plusEnabled ? "12341" : "12340", 6240768, 6);
  buffer.writeUInt16LE(plusEnabled ? 12341 : 12340, 5020144);
  [
    [2048447, 235],
    [4282917, 235],
    [4282943, 3],
    [4283029, 3],
    [4283206, 235],
    [4283231, [184, 3, 0, 0, 0, 235, 237]],
    [5020144, 53],
    [6240772, 49]
  ].forEach(([offset, value]) => {
    if (Array.isArray(value)) {
      value.forEach((v, i) => buffer.writeUInt8(v, offset + i));
    } else {
      buffer.writeUInt8(value, offset);
    }
  });
  await fs.writeFile(exePath, buffer);
  await fs.remove(path.join(clientDir, "Data", "enUs", "realmlist.wtf"));
  await fs.ensureDir(path.join(clientDir, "WTF"));
  const configPath = path.join(clientDir, "WTF", "Config.wtf");
  const raw = await fs.exists(configPath) ? await fs.readFile(configPath, { encoding: "utf-8" }) : "";
  await fs.remove(configPath);
  const configWtf = Object.fromEntries(
    raw.split("\n").map((l) => {
      const [_, k, v] = l.match(/SET (\w+) "(.+)"/) ?? [];
      return !k || !v ? void 0 : [k, v];
    }).filter(isNotUndef)
  );
  const primaryDisplay = electron.screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;
  const realmInfo = plusEnabled ? {
    realmList: "centurionpvp.com",
    patchList: "centurionpvp.com",
    realmName: "Legionnaire Plus"
  } : {
    realmList: "centurionpvp.com",
    patchList: "centurionpvp.com",
    realmName: "Legionnaire"
  };
  const parsed = {
    // Defaults
    gxResolution: `${width}x${height}`,
    // gxColorBits: primaryDisplay.colorDepth,
    // gxDepthBits: primaryDisplay.colorDepth,
    // gxRefresh: 60,
    // gxMultisample: 8,
    // gxMultisampleQuality: 0,
    // gxTripleBuffer: 1,
    // anisotropic: 16,
    // frillDensity: 48,
    // fullAlpha: 1,
    // SmallCull: 0.01,
    // DistCull: 888.8,
    // shadowLevel: 0,
    // trilinear: 1,
    // specular: 1,
    // pixelShaders: 1,
    // M2UsePixelShaders: 1,
    // particleDensity: 1,
    // unitDrawDist: 300,
    // weatherDensity: 3,
    // movieSubtitle: 1,
    // minimapZoom: 0,
    // minimapInsideZoom: 0,
    // SoundZoneMusicNoDelay: 1,
    // Parsed config
    ...configWtf,
    // Realm list
    ...realmInfo,
    // Mandatory
    hwDetect: 0,
    // Skip hardware change detection
    gxWindow: 1,
    // Maximized windowed mode
    gxMaximize: 1,
    // Maximized windowed mode
    gxCursor: 1,
    // Hardware cursor
    // M2UseShaders: 1, // Vertex animation shader
    checkAddonVersion: 0
    // Load out of date addons
  };
  await fs.writeFile(
    configPath,
    Object.entries(parsed).filter((v) => v[1] !== void 0 && v[1] !== null).map((l) => `SET ${l[0]} "${l[1]}"`).join("\n")
  );
  Logger.log("Config.wtf successfully patched");
};
const launcherRouter = createTRPCRouter({
  start: publicProcedure.mutation(async () => {
    const { cleanWdb, reopenLauncher, clientDir } = Preferences.data;
    if (!clientDir)
      return false;
    const clientPath = path.join(clientDir, "WoW.exe");
    Logger.log(`Launching ${clientPath}...`);
    if (await isGameRunning())
      return false;
    if (cleanWdb) {
      Logger.log("Cleaning up WDB...");
      await fs.remove(path.join(clientPath, "WDB"));
    }
    Logger.log("Checking Config.wtf...");
    await patchConfig();
    Logger.log("Launching WoW...");
    const process2 = child_process.spawn(clientPath, { detached: !reopenLauncher });
    if (!reopenLauncher) {
      exports.mainWindow?.close();
      return true;
    }
    exports.mainWindow?.hide();
    process2.on("exit", () => {
      Logger.log("WoW stopped");
      exports.mainWindow?.show();
    });
    return true;
  })
});
const updaterRouter = createTRPCRouter({
  invalidate: publicProcedure.mutation(() => Updater.invalidate()),
  verify: publicProcedure.mutation(() => Updater.verify()),
  update: publicProcedure.input(zod.z.boolean().optional()).mutation(({ input }) => Updater.update(input)),
  updatePortable: publicProcedure.mutation(() => Updater.updateLauncher()),
  observe: publicProcedure.subscription(() => Updater.observe())
});
const generalRouter = createTRPCRouter({
  version: publicProcedure.query(() => electron.app.getVersion()),
  quit: publicProcedure.mutation(() => exports.mainWindow?.close()),
  minimize: publicProcedure.mutation(() => exports.mainWindow?.minimize()),
  openLink: publicProcedure.input(zod.z.string().url()).mutation(({ input }) => electron.shell.openExternal(input)),
  dragWindow: publicProcedure.input(zod.z.object({ x: zod.z.number(), y: zod.z.number() })).mutation(({ input }) => {
    if (!exports.mainWindow)
      return;
    const [x = 0, y = 0] = exports.mainWindow.getPosition();
    exports.mainWindow.setPosition(x + input.x, y + input.y);
  }),
  filePicker: publicProcedure.input(
    zod.z.object({
      title: zod.z.string().optional(),
      message: zod.z.string().optional(),
      filters: zod.z.array(
        zod.z.object({
          name: zod.z.string(),
          extensions: zod.z.array(zod.z.string())
        })
      ).optional(),
      properties: zod.z.array(
        zod.z.enum([
          "openDirectory",
          "openFile",
          "multiSelections",
          "showHiddenFiles",
          "createDirectory",
          "promptToCreate",
          "noResolveAliases",
          "treatPackageAsDirectory",
          "dontAddToRecent"
        ])
      ).optional()
    })
  ).mutation(async ({ input }) => {
    if (!exports.mainWindow)
      return { canceled: true };
    const { canceled, filePaths } = await electron.dialog.showOpenDialog(
      exports.mainWindow,
      input
    );
    return canceled ? { canceled: true } : {
      canceled: false,
      path: filePaths
    };
  })
});
const preferencesRouter = createTRPCRouter({
  get: publicProcedure.output(PreferencesSchema).query(() => Preferences.data),
  set: publicProcedure.input(PreferencesSchema.partial()).mutation(async ({ input }) => {
    if (input.clientDir && !await Preferences.isValidClientDir(input.clientDir)) {
      throw new Error("Invalid client directory. WoW.exe not found.");
    }
    Preferences.data = input;
    return Preferences.data;
  }),
  isValidClientDir: publicProcedure.input(zod.z.string().optional()).query(({ input }) => Preferences.isValidClientDir(input))
});
const appRouter = createTRPCRouter({
  general: generalRouter,
  preferences: preferencesRouter,
  launcher: launcherRouter,
  updater: updaterRouter
});
exports.mainWindow = null;
const createWindow = async () => {
  const { rememberPosition, windowPosition } = Preferences.data;
  const position = rememberPosition ? windowPosition : { width: 800, height: 600 };
  exports.mainWindow = new electron.BrowserWindow({
    ...position,
    minWidth: 800,
    minHeight: 600,
    icon,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: false,
      devTools: true
    }
  });
  main.createIPCHandler({ router: appRouter, windows: [exports.mainWindow] });
  exports.mainWindow.on("ready-to-show", () => {
    Updater.clearObservers();
    exports.mainWindow?.show();
  });
  exports.mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  exports.mainWindow.on("close", async () => {
    if (!exports.mainWindow)
      return;
    const [x = 0, y = 0] = exports.mainWindow.getPosition();
    const [width = 0, height = 0] = exports.mainWindow.getSize();
    Preferences.data = { windowPosition: { x, y, width, height } };
  });
  if (utils.is.dev && process.env.ELECTRON_RENDERER_URL) {
    exports.mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    exports.mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
};
electron.app.whenReady().then(async () => {
  Preferences.data = await Preferences.load();
  Updater.verify();
  utils.electronApp.setAppUserModelId("com.electron");
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  await createWindow();
});
electron.app.on("window-all-closed", async () => {
  await Logger.saveLog();
  electron.app.quit();
});
