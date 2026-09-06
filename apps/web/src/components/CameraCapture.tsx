import { useEffect, useRef, useState } from "react";

interface Shot {
  file: File;
  url: string;
}

export function CameraCapture({
  onDone,
  onClose,
}: {
  onDone: (files: File[]) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shotCount = useRef(0);
  const [shots, setShots] = useState<Shot[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch {
          if (!cancelled) {
            setError("Couldn't access the camera. Check your browser's camera permission and try again.");
          }
          return;
        }
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    }

    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function stopAndClose() {
    stopStream();
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    onClose();
  }

  function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        shotCount.current += 1;
        const file = new File([blob], `scan-${shotCount.current}.jpg`, { type: "image/jpeg" });
        setShots((prev) => [...prev, { file, url: URL.createObjectURL(blob) }]);
      },
      "image/jpeg",
      0.92,
    );
  }

  function removeShot(index: number) {
    setShots((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  }

  function finish() {
    stopStream();
    onDone(shots.map((s) => s.file));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="flex w-full max-w-[520px] flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Scan with camera</span>
          <button type="button" onClick={stopAndClose} className="text-muted hover:text-text" aria-label="Close">
            ×
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-border bg-surface-2 p-4 text-[13px] text-muted">{error}</div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-border bg-surface-3">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption -- live camera preview, no captions apply */}
              <video ref={videoRef} autoPlay playsInline muted className="w-full" />
            </div>
            <button
              type="button"
              onClick={capture}
              className="h-10 rounded-[11px] bg-accent text-sm font-semibold text-on-accent transition-transform duration-100 active:scale-[0.97]"
            >
              Capture
            </button>
          </>
        )}

        {shots.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {shots.map((s, i) => (
              <div key={s.url} className="relative">
                <img src={s.url} alt="" className="size-14 rounded-lg border border-border object-cover" />
                <button
                  type="button"
                  onClick={() => removeShot(i)}
                  className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-border bg-surface text-[11px]"
                  aria-label={`Remove shot ${i + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={stopAndClose} className="rounded-lg border border-border px-3.5 py-1.5 text-[12.5px]">
            Cancel
          </button>
          <button
            type="button"
            onClick={finish}
            disabled={shots.length === 0}
            className="rounded-lg bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-on-accent disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint"
          >
            Use {shots.length} photo{shots.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
