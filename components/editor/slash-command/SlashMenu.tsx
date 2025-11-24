"use client";

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Editor } from "@tiptap/core";
import {
  CommandItem,
  CommandHelpers,
  filterCommands,
  getSlashCommands,
} from "./types";

export interface SlashMenuProps {
  editor: Editor;
  query: string;
  range: { from: number; to: number };
  helpers?: CommandHelpers;
}

export interface SlashMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export const SlashMenu = forwardRef<SlashMenuRef, SlashMenuProps>(
  ({ editor, query, range, helpers }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const allCommands = getSlashCommands();
    const filteredCommands = filterCommands(allCommands, query);

    const menuContainerRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
      setSelectedIndex(0);
      try {
        if (menuContainerRef.current) {
          menuContainerRef.current.scrollTop = 0;
        }
      } catch {
        /* ignore */
      }
    }, [query]);

    useEffect(() => {
      const handler = () => {
        try {
          fileInputRef.current?.click();
        } catch (err) {
          console.warn("[SlashMenu] failed to open file input:", err);
        }
      };
      window.addEventListener("slash-upload-image-request", handler);
      return () => window.removeEventListener("slash-upload-image-request", handler);
    }, []);

    // Build effective helpers: prefer provided helpers, otherwise use sensible fallbacks
    const effectiveHelpers: CommandHelpers = {
            openOverlay: helpers?.openOverlay
              ? helpers.openOverlay
              : (name: string, opts?: Record<string, any>) => {
                  try {
                    // Prefer the explicit drawing shim for the draw command when available.
                    if (typeof window !== "undefined" && name === "draw" && (window as any).__openDrawingOverlay) {
                      try {
                        (window as any).__openDrawingOverlay();
                        return;
                      } catch (err) {
                        // fallback to event dispatch below
                        console.warn("[SlashMenu] __openDrawingOverlay call failed:", err);
                      }
                    }

                    // Otherwise dispatch the generic overlay event (legacy)
                    window.dispatchEvent(
                      new CustomEvent("slash:open-overlay", { detail: { name, opts } })
                    );
                  } catch (e) {
                    // no-op
                  }
                },
      openFilePicker: helpers?.openFilePicker
        ? helpers.openFilePicker
        : async (accept = "image/*") =>
            await new Promise<File | null>((resolve) => {
              const input = fileInputRef.current;
              if (!input) {
                resolve(null);
                return;
              }
              const prevAccept = input.accept;
              input.accept = accept;
              const cleanup = () => {
                try {
                  input.accept = prevAccept;
                  input.onchange = null;
                  input.value = "";
                } catch {}
              };
              input.onchange = () => {
                const f = input.files?.[0] ?? null;
                cleanup();
                resolve(f);
              };
              try {
                input.click();
              } catch {
                cleanup();
                resolve(null);
              }
            }),
      uploadFile: helpers?.uploadFile
        ? helpers.uploadFile
        : async (file: File | Blob) => {
            const fd = new FormData();
            const filename = (file as File)?.name ?? `upload-${Date.now()}.bin`;
            fd.append("file", file as any, filename);
            const res = await fetch("/api/uploads", { method: "POST", body: fd });
            if (!res.ok) throw new Error("upload failed");
            const json = await res.json().catch(() => ({}));
            return { url: json?.url, filename: json?.filename, size: json?.size };
          },
      notify: helpers?.notify ? helpers.notify : (msg: string) => console.log(msg),
    };

    const executeCommand = async (item: CommandItem) => {
      try {
        // attempt to remove the slash + query range, placing cursor at range.from
        try {
          if (typeof (editor.chain as any) === "function") {
            try {
              editor
                .chain()
                .focus()
                .setTextSelection(range.from as any)
                .deleteRange({ from: range.from, to: range.to })
                .run();
            } catch {
              try {
                editor
                  .chain()
                  .focus()
                  .setTextSelection({ from: range.from, to: range.from })
                  .deleteRange({ from: range.from, to: range.to })
                  .run();
              } catch {
                editor.commands.setTextSelection(range.from);
                editor.commands.deleteRange({ from: range.from, to: range.to });
                editor.commands.focus();
              }
            }
          } else {
            editor.commands.setTextSelection(range.from);
            editor.commands.deleteRange({ from: range.from, to: range.to });
            editor.commands.focus();
          }
        } catch (delErr) {
          console.warn("[SlashMenu] failed to delete slash/query range:", delErr);
        }

        // Prefer new signature: (editor, helpers)
        try {
          await (item.command as any)(editor, effectiveHelpers);
          return;
        } catch (err) {
          // fallback to context object (legacy)
          const context = { editor, range, query, items: filteredCommands };
          try {
            await (item.command as any)(context);
            return;
          } catch (err2) {
            // final fallback: editor only
            try {
              await (item.command as any)(editor);
              return;
            } catch (err3) {
              console.warn("[SlashMenu] command execution failed:", err3);
            }
          }
        }
      } catch (err) {
        console.warn("[SlashMenu] command execution outer error:", err);
      } finally {
        try {
          editor.commands.focus();
        } catch {}
      }
    };

    const onFileChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
      const file = ev.target.files?.[0];
      if (!file) return;

      try {
        const MAX_BYTES = Number(process.env.NEXT_PUBLIC_UPLOAD_MAX_BYTES ?? 25 * 1024 * 1024);
        if (file.size > MAX_BYTES) {
          console.warn("[SlashMenu] selected file too large", file.size);
          return;
        }

        let url: string | undefined;

        if (helpers?.uploadFile) {
          try {
            const out = await helpers.uploadFile(file);
            url = out?.url;
          } catch (err) {
            console.error("[SlashMenu] helpers.uploadFile failed", err);
          }
        }

        if (!url) {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/uploads", { method: "POST", body: fd });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error("[SlashMenu] upload failed", res.status, text);
            return;
          }
          const data = await res.json().catch(() => null);
          url = data?.url;
        }

        if (!url) {
          console.error("[SlashMenu] upload response missing url");
          return;
        }

        try {
           if (effectiveHelpers.openOverlay) {
            try {
              // `image` is a suggested overlay name; change to whatever your overlay consumes.
              effectiveHelpers.openOverlay("image", { url, filename: file.name });
              // keep focus on the editor after overlay opens
              try { editor.commands.focus(); } catch {}
            } catch (overlayErr) {
              // If overlay fails, fall back to inserting image into document
              try {
                editor.chain().focus().setImage({ src: url }).run();
                editor.commands.focus();
              } catch (insErr) {
                console.error("[SlashMenu] failed fallback insert image:", insErr);
              }
            }
          } else {
            // No helpers — insert image directly into the doc (legacy behavior)
            editor.chain().focus().setImage({ src: url }).run();
            editor.commands.focus();
          }
        } catch (err) {
          console.error("[SlashMenu] failed to handle uploaded image", err);
        }
      } catch (err) {
        console.error("[SlashMenu] upload error", err);
      } finally {
        if (ev.currentTarget) ev.currentTarget.value = "";
      }
    };

    const handleKeyDown = (event: KeyboardEvent): boolean => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return false;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((prev) =>
          filteredCommands.length > 0 ? (prev <= 0 ? filteredCommands.length - 1 : prev - 1) : 0
        );
        return true;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((prev) =>
          filteredCommands.length > 0 ? (prev >= filteredCommands.length - 1 ? 0 : prev + 1) : 0
        );
        return true;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (filteredCommands[selectedIndex]) {
          executeCommand(filteredCommands[selectedIndex]);
        }
        return true;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        return true;
      }

      return false;
    };

    useImperativeHandle(ref, () => ({ onKeyDown: handleKeyDown }));

    useEffect(() => {
      try {
        const container = menuContainerRef.current;
        if (!container) return;
        const el = container.querySelector<HTMLElement>(`#slash-command-${selectedIndex}`);
        if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } catch {
        /* ignore */
      }
    }, [selectedIndex]);

    if (filteredCommands.length === 0) {
      return (
        <div className="slash-menu" role="dialog" aria-label="Slash command menu" ref={menuContainerRef}>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />
          <div className="slash-menu-empty">
            <p>No results for "{query}"</p>
          </div>
        </div>
      );
    }

    return (
      <div className="slash-menu" role="dialog" aria-label="Slash command menu" ref={menuContainerRef}>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />

        <div className="slash-menu-header">
          <span className="slash-menu-title">{query ? `Search: "${query}"` : "Select a block"}</span>
        </div>

        <div className="slash-menu-items" role="list">
          {filteredCommands.map((item, index) => (
            <button
              key={`${item.title}-${index}`}
              id={`slash-command-${index}`}
              type="button"
              role="listitem"
              className={`slash-menu-item ${index === selectedIndex ? "selected" : ""}`}
              onClick={() => executeCommand(item)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="slash-menu-item-icon">{item.icon}</div>
              <div className="slash-menu-item-content">
                <div className="slash-menu-item-title">{item.title}</div>
                <div className="slash-menu-item-description">{item.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }
);

SlashMenu.displayName = "SlashMenu";
export default SlashMenu;
