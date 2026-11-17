"use client";

export type UploadResponse = { ok?: boolean; message?: string; errors?: Record<string, string>; url?: string; moduleId?: string };

/** POSTs a FormData with upload progress (fetch can't report upload progress). */
export function postWithProgress(url: string, data: FormData, onProgress: (pct: number) => void): Promise<UploadResponse> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText) as UploadResponse);
      } catch {
        resolve({ message: xhr.status === 413 ? "That file is too large for the server." : "Something went wrong. Please try again." });
      }
    };
    xhr.onerror = () => resolve({ message: "The upload failed. Check your connection and try again." });
    xhr.send(data);
  });
}

export function formatBytes(n: number) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}
