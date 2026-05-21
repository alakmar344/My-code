import { useState } from "react";

function TreeNode({ node, selectedPath, onSelect, onCreateFile, onCreateFolder, onRename, onDelete }) {
  const [open, setOpen] = useState(true);

  if (node.type === "file") {
    const selected = selectedPath === node.path;
    return (
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        className={`w-full rounded px-2 py-1 text-left text-sm ${
          selected ? "bg-indigo-600 text-white" : "hover:bg-slate-800"
        }`}
      >
        {node.name}
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded px-1 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
        >
          {open ? "▼" : "▶"}
        </button>
        <span className="text-sm font-medium">{node.name}</span>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            className="rounded bg-slate-800 px-1 text-xs"
            onClick={() => onCreateFile(node.path)}
          >
            +F
          </button>
          <button
            type="button"
            className="rounded bg-slate-800 px-1 text-xs"
            onClick={() => onCreateFolder(node.path)}
          >
            +D
          </button>
          {node.path !== "/" && (
            <>
              <button
                type="button"
                className="rounded bg-slate-800 px-1 text-xs"
                onClick={() => onRename(node.path)}
              >
                ✎
              </button>
              <button
                type="button"
                className="rounded bg-slate-800 px-1 text-xs text-rose-300"
                onClick={() => onDelete(node.path)}
              >
                🗑
              </button>
            </>
          )}
        </div>
      </div>

      {open && (
        <div className="ml-4 space-y-1 border-l border-slate-700 pl-2">
          {node.children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileTree(props) {
  const { tree } = props;

  return (
    <div className="h-full overflow-auto rounded-lg border border-slate-700 bg-slate-900 p-2">
      {tree.length === 0 ? (
        <p className="text-xs text-slate-400">No files</p>
      ) : (
        tree.map((node) => <TreeNode key={node.path} node={node} {...props} />)
      )}
    </div>
  );
}
