import { Volume } from "memfs";

const DEFAULT_FILES = {
  "/index.js": "console.log('Hello from eSAMz Code');\n",
  "/main.py": "print('Hello from eSAMz Code')\n",
  "/main.sh": "echo 'Hello from eSAMz Code'\n"
};

const normalize = (filePath) => {
  if (!filePath || filePath === "/") return "/";
  return filePath.startsWith("/") ? filePath : `/${filePath}`;
};

const inferLanguageFromPath = (filePath) => {
  if (filePath.endsWith(".py")) return "python";
  if (filePath.endsWith(".sh")) return "bash";
  return "javascript";
};

export const createVirtualFS = (initialFiles = DEFAULT_FILES) => {
  const vol = Volume.fromJSON(initialFiles, "/");

  const getSnapshot = () => vol.toJSON("/");

  const readFile = (filePath) => vol.readFileSync(normalize(filePath), "utf8");

  const writeFile = (filePath, content) => {
    const target = normalize(filePath);
    const parent = target.split("/").slice(0, -1).join("/") || "/";
    vol.mkdirSync(parent, { recursive: true });
    vol.writeFileSync(target, content, "utf8");
  };

  const createFolder = (folderPath) => {
    vol.mkdirSync(normalize(folderPath), { recursive: true });
  };

  const removePath = (targetPath) => {
    const target = normalize(targetPath);
    const snapshot = getSnapshot();

    if (snapshot[target] !== undefined) {
      vol.unlinkSync(target);
      return;
    }

    const prefix = `${target.replace(/\/$/, "")}/`;
    Object.keys(snapshot)
      .filter((path) => path.startsWith(prefix))
      .forEach((path) => vol.unlinkSync(path));
  };

  const renamePath = (from, to) => {
    const source = normalize(from);
    const destination = normalize(to);
    const snapshot = getSnapshot();

    if (snapshot[source] !== undefined) {
      const content = readFile(source);
      writeFile(destination, content);
      vol.unlinkSync(source);
      return;
    }

    const prefix = `${source.replace(/\/$/, "")}/`;
    Object.keys(snapshot)
      .filter((path) => path.startsWith(prefix))
      .forEach((path) => {
        const relative = path.slice(prefix.length);
        const content = readFile(path);
        const nextPath = `${destination.replace(/\/$/, "")}/${relative}`;
        writeFile(nextPath, content);
        vol.unlinkSync(path);
      });
  };

  const listTree = () => {
    const snapshot = getSnapshot();
    const root = { name: "/", path: "/", type: "folder", children: [] };
    const nodeMap = new Map([["/", root]]);

    const ensureFolder = (folderPath) => {
      if (nodeMap.has(folderPath)) return nodeMap.get(folderPath);
      const segments = folderPath.split("/").filter(Boolean);
      const folderName = segments[segments.length - 1] || "/";
      const parentPath = segments.length > 1 ? `/${segments.slice(0, -1).join("/")}` : "/";
      const parent = ensureFolder(parentPath);
      const folder = { name: folderName, path: folderPath, type: "folder", children: [] };
      parent.children.push(folder);
      nodeMap.set(folderPath, folder);
      return folder;
    };

    Object.keys(snapshot)
      .sort((a, b) => a.localeCompare(b))
      .forEach((filePath) => {
        const normalizedPath = normalize(filePath);
        const segments = normalizedPath.split("/").filter(Boolean);
        const fileName = segments.pop();
        const folderPath = segments.length ? `/${segments.join("/")}` : "/";
        const folder = ensureFolder(folderPath);
        folder.children.push({ name: fileName, path: normalizedPath, type: "file" });
      });

    const sortTree = (node) => {
      if (!node.children) return;
      node.children.sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(sortTree);
    };

    sortTree(root);
    return root.children;
  };

  const applyAgentFileWrites = (files) => {
    if (Array.isArray(files)) {
      files.forEach((file) => {
        if (file?.path) writeFile(file.path, file.content ?? "");
      });
      return;
    }

    if (files && typeof files === "object") {
      Object.entries(files).forEach(([filePath, content]) => writeFile(filePath, content ?? ""));
    }
  };

  return {
    getSnapshot,
    readFile,
    writeFile,
    createFolder,
    removePath,
    renamePath,
    listTree,
    applyAgentFileWrites,
    inferLanguageFromPath
  };
};

export { inferLanguageFromPath };
