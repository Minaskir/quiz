const state = {
  teams: [],
  categories: [],
  activeQuestion: null
};

const setupScreen = document.getElementById("setup-screen");
const gameScreen = document.getElementById("game-screen");
const teamsForm = document.getElementById("teams-form");
const scoreboard = document.getElementById("scoreboard");
const board = document.getElementById("board");
const finishBtn = document.getElementById("finish-btn");

const questionModal = document.getElementById("question-modal");
const modalCategory = document.getElementById("modal-category");
const modalQuestion = document.getElementById("modal-question");
const modalOptions = document.getElementById("modal-options");
const answerTeamSelect = document.getElementById("answer-team");
const correctBtn = document.getElementById("correct-btn");
const wrongBtn = document.getElementById("wrong-btn");
const closeModalBtn = document.getElementById("close-modal-btn");
const answerStatus = document.getElementById("answer-status");
const manualControls = document.getElementById("manual-controls");

const resultModal = document.getElementById("result-modal");
const winnerText = document.getElementById("winner-text");
const winnerTeamName = document.getElementById("winner-team-name");
const restartBtn = document.getElementById("restart-btn");

const suspenseAudio = new Audio("./friend-clock-2008_trimmed.mp3");
const yesAudio = new Audio("./q6-yes-2008.mp3");
const wrongAudio = new Audio("./khsm_q6-wrong.mp3");
const winAudio = new Audio("./khsm_q10-correct.mp3");
let isAnswerInProgress = false;

function playAudio(audio) {
  return new Promise((resolve) => {
    audio.pause();
    audio.currentTime = 0;

    const cleanUp = () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onEnded);
      resolve();
    };
    const onEnded = () => cleanUp();
    audio.addEventListener("ended", onEnded, { once: true });
    audio.addEventListener("error", onEnded, { once: true });

    audio.play().catch(() => cleanUp());
  });
}

function parseQuestionBlock(lines, startIndex) {
  const pointsMatch = lines[startIndex].match(/(\d+)/);
  if (!pointsMatch) {
    return { nextIndex: startIndex + 1, question: null };
  }

  const points = Number(pointsMatch[1]);
  const prompt = (lines[startIndex + 1] || "").trim();
  if (!prompt) {
    return { nextIndex: startIndex + 2, question: null };
  }

  let cursor = startIndex + 2;
  const joined = [];
  while (cursor < lines.length && lines[cursor].trim() !== "") {
    const current = lines[cursor].trim();
    joined.push(current);
    cursor += 1;
    if (current.endsWith(")")) {
      break;
    }
  }

  let options = [];
  let correctAnswer = "";
  let openAnswer = "";

  if (joined.length === 0) {
    return { nextIndex: cursor, question: null };
  }

  if (joined[0].startsWith("(")) {
    const optionsRaw = joined.join("\n")
      .replace(/^\(/, "")
      .replace(/\)$/, "");

    options = optionsRaw
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const isCorrect = item.startsWith("&");
        const text = item.replace(/^&/, "").trim();
        if (isCorrect) {
          correctAnswer = text;
        }
        return text;
      });
  } else {
    openAnswer = joined.join(" ");
    const answerMarker = openAnswer.match(/Ответ:\s*(.*)$/i);
    if (answerMarker) {
      correctAnswer = answerMarker[1].trim();
    }
  }

  return {
    nextIndex: cursor,
    question: {
      id: crypto.randomUUID(),
      points,
      prompt,
      options,
      correctAnswer,
      openAnswer,
      used: false,
      answered: false
    }
  };
}

function parseQuestions(rawText) {
  const lines = rawText.replace(/\r/g, "").split("\n");
  const categories = [];
  let i = 0;
  let currentCategory = null;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line) {
      i += 1;
      continue;
    }

    if (line.startsWith("Категория")) {
      const categoryName = line.match(/"(.+?)"/)?.[1] || line.replace("Категория", "").trim();
      currentCategory = { name: categoryName, questions: [] };
      categories.push(currentCategory);
      i += 1;
      continue;
    }

    if (/^\d+\s*очков/i.test(line) && currentCategory) {
      const { nextIndex, question } = parseQuestionBlock(lines, i);
      if (question) {
        currentCategory.questions.push(question);
      }
      i = Math.max(nextIndex, i + 1);
      continue;
    }

    i += 1;
  }

  return categories.filter((category) => category.questions.length > 0);
}

function renderScoreboard() {
  scoreboard.innerHTML = state.teams.map((team) => `
    <article class="team-card">
      <span class="team-name">${team.name}</span>
      <span class="team-score">${team.score}</span>
    </article>
  `).join("");
}

function renderBoard() {
  board.innerHTML = state.categories.map((category, categoryIndex) => {
    const questionButtons = category.questions
      .sort((a, b) => a.points - b.points)
      .map((question, questionIndex) => `
        <button
          type="button"
          class="question-btn"
          data-category-index="${categoryIndex}"
          data-question-id="${question.id}"
          ${question.used ? "disabled" : ""}
        >
          ${question.points}
        </button>
      `).join("");

    return `
      <section class="category-column">
        <h3 class="category-title">${category.name}</h3>
        ${questionButtons}
      </section>
    `;
  }).join("");
}

function openQuestionModal(question, categoryName) {
  state.activeQuestion = question;
  isAnswerInProgress = false;
  modalCategory.textContent = `${categoryName} - ${question.points} очков`;
  modalQuestion.textContent = question.prompt;
  answerStatus.textContent = "";
  answerStatus.classList.remove("success", "error");
  answerStatus.classList.add("hidden");

  if (question.options.length) {
    modalOptions.innerHTML = question.options
      .map((option, index) => `
        <li>
          <button type="button" class="option-btn" data-option-index="${index}">${option}</button>
        </li>
      `)
      .join("");
    manualControls.classList.add("hidden");
  } else {
    modalOptions.innerHTML = `
      <li class="open-question-note">Открытый вопрос (без вариантов)</li>
      ${question.correctAnswer ? `<li class="open-question-note"><strong>Ответ:</strong> ${question.correctAnswer}</li>` : ""}
    `;
    manualControls.classList.remove("hidden");
  }

  answerTeamSelect.innerHTML = state.teams
    .map((team) => `<option value="${team.id}">${team.name}</option>`)
    .join("");

  questionModal.classList.remove("hidden");
  questionModal.setAttribute("aria-hidden", "false");
}

function closeQuestionModal() {
  if (isAnswerInProgress) {
    return;
  }
  state.activeQuestion = null;
  questionModal.classList.add("hidden");
  questionModal.setAttribute("aria-hidden", "true");
  answerStatus.textContent = "";
  answerStatus.classList.remove("success", "error");
  answerStatus.classList.add("hidden");
}

function applyScore(isCorrect) {
  if (!state.activeQuestion || state.activeQuestion.answered) {
    return;
  }

  const teamId = answerTeamSelect.value;
  const team = state.teams.find((item) => item.id === teamId);
  if (!team) {
    return;
  }

  const delta = state.activeQuestion.points;
  team.score += isCorrect ? delta : -delta;
  state.activeQuestion.used = true;
  state.activeQuestion.answered = true;

  renderScoreboard();
  renderBoard();

  const allUsed = state.categories.every((category) =>
    category.questions.every((question) => question.used)
  );
  if (allUsed) {
    finishGame();
  }
}

function markButtonsDisabled() {
  const optionButtons = modalOptions.querySelectorAll(".option-btn");
  optionButtons.forEach((button) => {
    button.disabled = true;
  });
  return optionButtons;
}

async function handleOptionAnswer(optionButton) {
  if (!state.activeQuestion || state.activeQuestion.answered || isAnswerInProgress) {
    return;
  }

  const selectedOptionIndex = Number(optionButton.dataset.optionIndex);
  const selectedText = state.activeQuestion.options[selectedOptionIndex];
  const isCorrect = selectedText === state.activeQuestion.correctAnswer;
  const optionButtons = markButtonsDisabled();
  isAnswerInProgress = true;

  answerStatus.textContent = "Проверяем ответ...";
  answerStatus.classList.remove("success", "error");
  answerStatus.classList.remove("hidden");
  optionButton.classList.add("pending");

  await playAudio(suspenseAudio);
  optionButton.classList.remove("pending");

  if (isCorrect) {
    optionButton.classList.add("correct");
    answerStatus.textContent = "Ответ верный!";
    answerStatus.classList.remove("error");
    answerStatus.classList.add("success");
    await playAudio(yesAudio);
  } else {
    optionButton.classList.add("wrong");
    optionButtons.forEach((button) => {
      if (button.textContent.trim() === state.activeQuestion.correctAnswer) {
        button.classList.add("reveal-correct");
      }
    });
    answerStatus.textContent = "Ответ неверный!";
    answerStatus.classList.remove("success");
    answerStatus.classList.add("error");
    await playAudio(wrongAudio);
  }

  await new Promise((resolve) => setTimeout(resolve, 900));
  isAnswerInProgress = false;
  applyScore(isCorrect);
}

function finishGame() {
  const maxScore = Math.max(...state.teams.map((team) => team.score));
  const winners = state.teams.filter((team) => team.score === maxScore);

  if (winners.length > 1) {
    winnerTeamName.textContent = "Ничья";
    winnerText.textContent = `Ничья! Победители: ${winners.map((w) => w.name).join(", ")} (${maxScore} очков).`;
  } else {
    winnerTeamName.textContent = winners[0].name;
    winnerText.textContent = `Победила команда "${winners[0].name}" с результатом ${maxScore} очков.`;
  }

  resultModal.classList.remove("hidden");
  resultModal.setAttribute("aria-hidden", "false");
  playAudio(winAudio);
}

function startGame(teamNames, categories) {
  state.teams = teamNames.map((name) => ({
    id: crypto.randomUUID(),
    name,
    score: 0
  }));
  state.categories = categories;

  setupScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  renderScoreboard();
  renderBoard();
}

teamsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(teamsForm);
  const names = ["team1", "team2", "team3"]
    .map((key) => String(formData.get(key) || "").trim())
    .filter(Boolean);

  if (names.length !== 3) {
    window.alert("Нужно ввести названия всех 3 команд.");
    return;
  }

  try {
    const response = await fetch("./questions.txt");
    if (!response.ok) {
      throw new Error("Не удалось загрузить questions.txt");
    }

    const text = await response.text();
    const categories = parseQuestions(text);
    if (!categories.length) {
      throw new Error("Не удалось распознать вопросы из файла.");
    }

    startGame(names, categories);
  } catch (error) {
    window.alert(`Ошибка запуска игры: ${error.message}`);
  }
});

board.addEventListener("click", (event) => {
  const button = event.target.closest(".question-btn");
  if (!button || button.disabled) {
    return;
  }

  const categoryIndex = Number(button.dataset.categoryIndex);
  const questionId = button.dataset.questionId;
  const category = state.categories[categoryIndex];
  if (!category) {
    return;
  }

  const question = category.questions.find((item) => item.id === questionId);
  if (!question || question.used) {
    return;
  }

  openQuestionModal(question, category.name);
});

modalOptions.addEventListener("click", (event) => {
  const button = event.target.closest(".option-btn");
  if (!button || button.disabled) {
    return;
  }
  handleOptionAnswer(button);
});

correctBtn.addEventListener("click", () => applyScore(true));
wrongBtn.addEventListener("click", () => applyScore(false));
closeModalBtn.addEventListener("click", closeQuestionModal);
finishBtn.addEventListener("click", finishGame);

restartBtn.addEventListener("click", () => {
  window.location.reload();
});
