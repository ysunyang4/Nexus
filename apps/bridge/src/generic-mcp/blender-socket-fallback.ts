import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import child_process from "node:child_process";

export async function isBlenderSocketOpen(port = 9876): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(800);
    sock.connect(port, "127.0.0.1", () => {
      sock.destroy();
      resolve(true);
    });
    sock.on("error", () => {
      sock.destroy();
      resolve(false);
    });
    sock.on("timeout", () => {
      sock.destroy();
      resolve(false);
    });
  });
}

export async function sendBlenderSocketCommand(
  commandType: string,
  params: Record<string, any> = {},
  port = 9876
): Promise<any> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(15000);

    const payload = JSON.stringify({ type: commandType, params });
    let buffer = "";

    socket.connect(port, "127.0.0.1", () => {
      socket.write(payload);
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      try {
        const parsed = JSON.parse(buffer.trim());
        socket.destroy();
        if (parsed.status === "error") {
          reject(new Error(parsed.message || "Blender returned error"));
        } else {
          resolve(parsed.result !== undefined ? parsed.result : parsed);
        }
      } catch {
        // waiting for full json
      }
    });

    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`Blender socket timed out on port ${port}`));
    });

    socket.on("error", (err) => {
      socket.destroy();
      reject(err);
    });
  });
}

let cachedBlenderPath: string | null = null;

export function findBlenderExecutable(): string | null {
  if (cachedBlenderPath && fs.existsSync(cachedBlenderPath)) {
    return cachedBlenderPath;
  }

  if (process.env.BLENDER_PATH && fs.existsSync(process.env.BLENDER_PATH)) {
    cachedBlenderPath = process.env.BLENDER_PATH;
    return cachedBlenderPath;
  }

  const candidates = [
    "E:\\Tools\\Blender\\blender.exe",
    "D:\\Tools\\Blender\\blender.exe",
    "C:\\Tools\\Blender\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 4.1\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 4.0\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 3.6\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender\\blender.exe",
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      cachedBlenderPath = c;
      return c;
    }
  }

  // Check PATH
  const pathDirs = (process.env.PATH || "").split(path.delimiter);
  for (const dir of pathDirs) {
    const candidate = path.join(dir, process.platform === "win32" ? "blender.exe" : "blender");
    if (fs.existsSync(candidate)) {
      cachedBlenderPath = candidate;
      return candidate;
    }
  }

  return null;
}

export function cleanBlenderOutput(raw: string): string {
  if (!raw) return "";
  return raw
    .split(/\r?\n/)
    .filter((l) => {
      const s = l.trim();
      if (!s) return false;
      if (s.startsWith("BlenderMCP")) return false;
      if (s.startsWith("Blender quit")) return false;
      if (s.startsWith("Read prefs:")) return false;
      if (s.startsWith("Blender ") && s.includes("hash")) return false;
      if (s.startsWith("read file ")) return false;
      if (s.startsWith("Color management: using fallback mode")) return false;
      return true;
    })
    .join("\n")
    .trim();
}

export async function executeBlenderHeadless(
  code: string
): Promise<{ stdout: string; stderr: string; isError: boolean }> {
  const blenderExe = findBlenderExecutable();
  if (!blenderExe) {
    throw new Error(
      "Blender executable not found. Please install Blender or configure BLENDER_PATH environment variable."
    );
  }

  const tmpFile = path.join(os.tmpdir(), `nexus_blender_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);
  fs.writeFileSync(tmpFile, code, "utf8");

  try {
    const rawOut = child_process.execFileSync(blenderExe, ["-b", "--python", tmpFile], {
      encoding: "utf8",
      timeout: 45000,
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        PYTHONWARNINGS: "ignore",
        PYTHONUNBUFFERED: "1",
      },
    });

    const clean = cleanBlenderOutput(rawOut);
    return {
      stdout: clean || "SUCCESS: Blender script executed successfully (no standard output).",
      stderr: "",
      isError: false,
    };
  } catch (err: any) {
    const rawErr = (err.stdout ? String(err.stdout) : "") + "\n" + (err.stderr ? String(err.stderr) : "");
    const cleanErr = cleanBlenderOutput(rawErr) || err.message || String(err);
    return {
      stdout: "",
      stderr: `Blender Execution Error:\n${cleanErr}`,
      isError: true,
    };
  } finally {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {}
  }
}

export async function executeBlenderScript(
  code: string,
  port = 9876
): Promise<{ output: string; isError: boolean; mode: "socket" | "headless" }> {
  // 1. Try interactive Blender TCP socket if running
  const socketOpen = await isBlenderSocketOpen(port).catch(() => false);
  if (socketOpen) {
    try {
      const socketRes = await sendBlenderSocketCommand("execute_code", { code }, port);
      const text = typeof socketRes === "string" ? socketRes : JSON.stringify(socketRes, null, 2);
      return { output: text, isError: false, mode: "socket" };
    } catch (sErr: any) {
      console.warn("[BlenderBridge] Socket execution error, falling back to headless:", sErr.message);
    }
  }

  // 2. Headless Blender execution fallback
  try {
    const res = await executeBlenderHeadless(code);
    return {
      output: res.isError ? res.stderr : res.stdout,
      isError: res.isError,
      mode: "headless",
    };
  } catch (hErr: any) {
    return {
      output: `Blender Execution Unavailable: ${hErr.message}`,
      isError: true,
      mode: "headless",
    };
  }
}

export async function getBlenderSceneInfo(
  port = 9876
): Promise<{ scene: any; isError: boolean; mode: "socket" | "headless" }> {
  const socketOpen = await isBlenderSocketOpen(port).catch(() => false);
  if (socketOpen) {
    try {
      const socketRes = await sendBlenderSocketCommand("get_scene_info", {}, port);
      return { scene: socketRes, isError: false, mode: "socket" };
    } catch (sErr: any) {
      console.warn("[BlenderBridge] Scene info socket error, falling back to headless:", sErr.message);
    }
  }

  // Headless script to query scene objects
  const queryScript = `
import bpy, json
objs = []
for o in bpy.context.scene.objects:
    objs.append({
        "name": o.name,
        "type": o.type,
        "location": [round(v, 4) for v in o.location],
        "rotation_euler": [round(v, 4) for v in o.rotation_euler],
        "scale": [round(v, 4) for v in o.scale]
    })
print("__BLENDER_SCENE_JSON__" + json.dumps({
    "scene_name": bpy.context.scene.name,
    "total_objects": len(objs),
    "objects": objs
}))
`.trim();

  try {
    const res = await executeBlenderHeadless(queryScript);
    if (res.isError) {
      return { scene: res.stderr, isError: true, mode: "headless" };
    }
    const marker = "__BLENDER_SCENE_JSON__";
    const idx = res.stdout.indexOf(marker);
    if (idx !== -1) {
      const jsonStr = res.stdout.slice(idx + marker.length).trim();
      const parsed = JSON.parse(jsonStr);
      return { scene: parsed, isError: false, mode: "headless" };
    }
    return { scene: res.stdout, isError: false, mode: "headless" };
  } catch (err: any) {
    return { scene: `Failed to query Blender scene: ${err.message}`, isError: true, mode: "headless" };
  }
}

export function isBlenderTool(toolName: string): boolean {
  if (!toolName || typeof toolName !== "string") return false;
  const t = toolName.toLowerCase().trim().replace(/^localbridge_/, "").replace(/^nexus_/, "");
  return (
    t === "execute_blender_code" ||
    t === "run_bpy_script" ||
    t === "blender_execute_code" ||
    t === "blender_code" ||
    t === "get_scene_info" ||
    t === "scene_info" ||
    t.startsWith("blender_") ||
    t.startsWith("bpy_")
  );
}
