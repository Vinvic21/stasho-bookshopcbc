const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

function getToken() {
  return localStorage.getItem("stasho_token");
}

// `body` may be a plain object (sent as JSON) or a FormData (sent as multipart, used for photo uploads).
export async function apiFetch(path, { method = "GET", body, auth = true } = {}) {
  const headers = {};
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  if (!isForm) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}