import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import "xterm/css/xterm.css";

export default function TerminalPanel({ output, clearSignal }) {
  const hostRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const previousLengthRef = useRef(0);

  useEffect(() => {
    if (!hostRef.current || termRef.current) return;

    const term = new Terminal({
      convertEol: true,
      fontSize: 14,
      theme: {
        background: "#020617",
        foreground: "#e2e8f0"
      }
    });
    const fit = new FitAddon();

    termRef.current = term;
    fitRef.current = fit;

    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(hostRef.current);
    fit.fit();

    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const nextText = output || "";
    const previousLength = previousLengthRef.current;

    if (nextText.length < previousLength) {
      term.clear();
      term.write(nextText.replace(/\n/g, "\r\n"));
    } else {
      const delta = nextText.slice(previousLength);
      if (delta) term.write(delta.replace(/\n/g, "\r\n"));
    }

    previousLengthRef.current = nextText.length;
    fitRef.current?.fit();
  }, [output]);

  useEffect(() => {
    if (!termRef.current) return;
    termRef.current.clear();
    previousLengthRef.current = 0;
  }, [clearSignal]);

  return <div ref={hostRef} className="h-full w-full rounded-lg border border-slate-700" />;
}
