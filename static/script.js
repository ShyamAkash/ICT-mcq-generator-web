(() => {
  "use strict";

  const form = document.getElementById("mcq-form");
  const topicInput = document.getElementById("topic");
  const modelInput = document.getElementById("model");
  const button = document.getElementById("generate-btn");
  const status = document.getElementById("status");

  function setStatus(message, kind) {
    status.textContent = message || "";
    status.classList.remove("is-error", "is-success", "is-info");
    if (kind) status.classList.add(`is-${kind}`);
  }

  function setLoading(isLoading) {
    button.disabled = isLoading;
    button.classList.toggle("is-loading", isLoading);
  }

  function filenameFromResponse(response, fallback) {
    const header = response.headers.get("Content-Disposition") || "";
    const match = header.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    return match ? decodeURIComponent(match[1]) : fallback;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const topic = topicInput.value.trim();
    const model = modelInput.value.trim();
    const qtype = form.querySelector('input[name="qtype"]:checked').value;

    if (!topic) {
      setStatus("Enter a topic, question, or code snippet first.", "error");
      topicInput.focus();
      return;
    }
    if (!model) {
      setStatus("Enter a Gemini model name.", "error");
      modelInput.focus();
      return;
    }

    setLoading(true);
    setStatus("Contacting Gemini — this can take up to a minute…", "info");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, model, qtype }),
      });

      if (!response.ok) {
        let message = `Request failed (${response.status}).`;
        try {
          const data = await response.json();
          if (data && data.error) message = data.error;
        } catch (_) {
          /* response wasn't JSON — keep the generic message */
        }
        setStatus(message, "error");
        return;
      }

      const blob = await response.blob();
      const filename = filenameFromResponse(response, "question.docx");
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setStatus(`Downloaded ${filename}`, "success");
    } catch (err) {
      setStatus(
        "Couldn't reach the server. Check your connection and try again.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  form.addEventListener("submit", handleSubmit);
})();
