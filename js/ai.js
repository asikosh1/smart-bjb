// AI grading service — grades open answers via OLLAMA CLOUD (online API).
// This does NOT need a local laptop server: requests go to https://ollama.com
// with your API key. If the cloud call fails (network, key, model), we fall
// back to a simple length-based heuristic so grading NEVER blocks the teacher.
//
// If you ever want to switch back to a local server, change CLOUD_URL to
// "http://127.0.0.1:11434/api/chat" and clear CLOUD_API_KEY.

const CLOUD_URL = "http://127.0.0.1:5001/smart-bjb/us-central1/ollamaProxy";
const CLOUD_MODEL = "gpt-oss:120b"; // must be a model available on your Ollama cloud plan
const CLOUD_API_KEY = "12452dc3893141ca90077463df968a15.P0TlKyEwyPN_8wiUFBNl0MVu";

/**
 * Grade a single open answer using the online Ollama cloud model.
 * Returns {score, feedback}. Never throws — on failure returns a heuristic score.
 */
export async function gradeOpenAnswer(questionText, studentAnswer, maxPoints, correctAnswer = "") {
  if (!studentAnswer || !String(studentAnswer).trim()) {
    return { score: 0, feedback: "Жауап берілмеген" };
  }

  const prompt = `Сіз — қазақ мектебінің мұғалімісіз. Оқушының жауабын бағалаңыз.

Сұрақ: ${questionText}
${correctAnswer ? `Дұрыс жауап/үлгі: ${correctAnswer}` : ""}
Оқушының жауабы: ${studentAnswer}

Максималды балл: ${maxPoints}

Жауапты ТЕК JSON форматында беріңіз, басқа мәтін жазбаңыз:
{"score": <0 мен ${maxPoints} аралығындағы сан>, "feedback": "<қысқа түсіндірме, қазақ тілінде>"}`;

  try {
    const response = await fetch(CLOUD_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CLOUD_API_KEY}`,
      },
      body: JSON.stringify({
        model: CLOUD_MODEL,
        messages: [
          { role: "system", content: "Сіз — білім беру жүйесіндегі көмекшісіз. Жауабыңыз тек JSON болсын." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Ollama cloud API error:", response.status, errText);
      return heuristicGrade(studentAnswer, maxPoints, `Ollama cloud ${response.status}`);
    }

    const data = await response.json();
    const content = data.message?.content || data.response || "";

    // Parse JSON (model may wrap it in ```json ... ```)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("AI response has no JSON:", content.slice(0, 120));
      return heuristicGrade(studentAnswer, maxPoints, "JSON табылмады");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const score = Math.max(0, Math.min(maxPoints, Number(parsed.score) || 0));
    const feedback = String(parsed.feedback || "");
    return { score, feedback };
  } catch (e) {
    // Network / CORS / server unreachable
    console.error("AI grading failed (Ollama cloud недоступна):", e);
    return heuristicGrade(studentAnswer, maxPoints, "Ollama cloud қосылмаған");
  }
}

/**
 * Simple length-based fallback so teachers can always finish grading
 * even if the cloud API is unavailable. 120+ chars ≈ full marks.
 */
function heuristicGrade(answer, maxPoints, reason) {
  const len = String(answer).trim().length;
  const ratio = Math.min(1, len / 120);
  const score = Math.round(ratio * maxPoints * 10) / 10;
  return { score, feedback: `Автоматты шамалау (${reason}). Қолмен тексеріңіз.` };
}

/**
 * Grade all open questions in a submission.
 */
export async function gradeAllOpenAnswers(questions, answers) {
  const openQs = (questions || []).filter((q) => q.type === "open");
  const results = {};
  for (const q of openQs) {
    const ans = answers?.[q.id] || "";
    try {
      results[q.id] = await gradeOpenAnswer(q.text, ans, q.points, q.correct || "");
    } catch (e) {
      results[q.id] = { score: null, feedback: "AI бағалау қатесі: " + (e.message || "") };
    }
  }
  return results;
}
