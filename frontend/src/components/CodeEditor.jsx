import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { StreamLanguage } from "@codemirror/language";
import { shell as shellMode } from "@codemirror/legacy-modes/mode/shell";
import { oneDark } from "@codemirror/theme-one-dark";

const extensionForPath = (filePath) => {
  if (filePath.endsWith(".py")) return python();
  if (filePath.endsWith(".html")) return html();
  if (filePath.endsWith(".css")) return css();
  if (filePath.endsWith(".sh") || filePath.endsWith(".bash")) {
    return StreamLanguage.define(shellMode);
  }
  return javascript({ jsx: true });
};

export default function CodeEditor({ filePath, value, onChange }) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!hostRef.current || viewRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current?.(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        extensionForPath(filePath),
        oneDark,
        updateListener,
        EditorView.lineWrapping,
        EditorView.theme({
          "&": { height: "100%", fontSize: "14px" },
          ".cm-scroller": { overflow: "auto" }
        })
      ]
    });

    viewRef.current = new EditorView({ state, parent: hostRef.current });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value }
      });
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentText = view.state.doc.toString();
    const nextState = EditorState.create({
      doc: currentText,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        extensionForPath(filePath),
        oneDark,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString());
          }
        }),
        EditorView.lineWrapping,
        EditorView.theme({
          "&": { height: "100%", fontSize: "14px" },
          ".cm-scroller": { overflow: "auto" }
        })
      ]
    });
    view.setState(nextState);
  }, [filePath]);

  return <div ref={hostRef} className="h-full w-full overflow-hidden rounded-lg border border-slate-700" />;
}
