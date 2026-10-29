const DEFAULT_SERVER = "https://sugimoto-topic-engine.onrender.com";
const $ = (id) => document.getElementById(id);
chrome.storage.sync.get(["key", "server"]).then(({ key = "", server = DEFAULT_SERVER }) => {
  $("key").value = key;
  $("server").value = server;
});
$("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({ key: $("key").value.trim(), server: ($("server").value.trim() || DEFAULT_SERVER).replace(/\/+$/, "") });
  $("ok").textContent = "Saved ✓";
});
