document.addEventListener("DOMContentLoaded", () => {
	const todoForm = document.getElementById("todo-form");
	const todoInputs = document.getElementById("todo-input");
	const addBtn = document.getElementById("add_cta");
	const todoList = document.getElementById("todo-list");
	const emptyState = document.getElementById("empty-state");
	const itemCount = document.getElementById("item-count");
	const clearCompletedBtn = document.getElementById("clear-completed");
	const filterButtons = document.querySelectorAll(".filter");

	const demoToggle = document.getElementById("demo-mode");
	const apiKeyInput = document.getElementById("api-key-input");
	const saveKeyBtn = document.getElementById("save-key");
	const aiStatus = document.getElementById("ai-status");
	const aiAnalyzing = document.getElementById("ai-analyzing");
	const planDayBtn = document.getElementById("plan-day");
	const planOutput = document.getElementById("plan-output");

	let justAddedId = null;

	let tasks = JSON.parse(localStorage.getItem("tasks")) || [];
	let currentFilter = "all";

	render();
	if (AI.hasKey()) apiKeyInput.value = AI.getKey();
	demoToggle.checked = AI.isDemo();
	refreshAiStatus();

	todoForm.addEventListener("submit", async (e) => {
		e.preventDefault();

		const rawText = todoInputs.value.trim();
		if (rawText === "") return;

		todoInputs.value = "";

		let newTask = {
			id: Date.now(),
			text: rawText,
			completed: false,
			priority: "",
			category: "",
			dueDate: "",
		};

		if (AI.enabled()) {
			setBusy(true, "✦ Thinking…");
			aiAnalyzing.classList.remove("hidden");
			try {
				const info = await AI.enrichTask(rawText);
				newTask.text = info.text || rawText;
				newTask.priority = info.priority || "";
				newTask.category = info.category || "";
				newTask.dueDate = info.dueDate || "";
				refreshAiStatus();
			} catch (err) {
				console.error(err);
				setStatus("AI call failed — added as a plain task. " + err.message, "err");
			} finally {
				setBusy(false);
				aiAnalyzing.classList.add("hidden");
			}
		}

		justAddedId = newTask.id;
		tasks.push(newTask);
		saveTask();
		render();
		justAddedId = null;
	});

	todoList.addEventListener("click", (e) => {
		const li = e.target.closest(".todo-item");
		if (!li) return;

		const id = Number(li.dataset.id);

		if (e.target.classList.contains("todo-item__delete")) {
			tasks = tasks.filter((task) => task.id !== id);
			saveTask();
			render();
			return;
		}

		if (e.target.classList.contains("todo-item__checkbox")) {
			const task = tasks.find((task) => task.id === id);
			if (task) task.completed = !task.completed;
			saveTask();
			render();
		}
	});

	filterButtons.forEach((button) => {
		button.addEventListener("click", () => {
			currentFilter = button.dataset.filter;
			filterButtons.forEach((b) => b.classList.remove("is-active"));
			button.classList.add("is-active");
			render();
		});
	});

	clearCompletedBtn.addEventListener("click", () => {
		tasks = tasks.filter((task) => !task.completed);
		saveTask();
		render();
	});

	demoToggle.addEventListener("change", () => {
		AI.setDemo(demoToggle.checked);
		refreshAiStatus();
	});

	saveKeyBtn.addEventListener("click", () => {
		const key = apiKeyInput.value.trim();
		if (key === "") {
			setStatus("Please paste a key first.", "err");
			return;
		}
		AI.setKey(key);
		refreshAiStatus();
	});

	planDayBtn.addEventListener("click", async () => {
		if (!AI.enabled()) {
			setStatus("Turn on Demo mode or add a key first to plan your day.", "err");
			return;
		}

		const activeTasks = tasks.filter((task) => !task.completed);
		if (activeTasks.length === 0) {
			showPlan("Nothing to plan — your list is clear. 🎉");
			return;
		}

		planDayBtn.disabled = true;
		planDayBtn.textContent = "Planning…";
		try {
			const plan = await AI.planDay(activeTasks);
			showPlan(plan);
		} catch (err) {
			console.error(err);
			showPlan("Couldn't plan your day: " + err.message);
		} finally {
			planDayBtn.disabled = false;
			planDayBtn.textContent = "✨ Plan my day";
		}
	});

	function render() {
		const visibleTasks = tasks.filter((task) => {
			if (currentFilter === "active") return !task.completed;
			if (currentFilter === "completed") return task.completed;
			return true;
		});

		todoList.innerHTML = "";
		visibleTasks.forEach((task) => renderTask(task));

		emptyState.classList.toggle("hidden", tasks.length > 0);

		const remaining = tasks.filter((task) => !task.completed).length;
		itemCount.textContent = `${remaining} item${remaining === 1 ? "" : "s"} left`;
	}

	function renderTask(task) {
		const li = document.createElement("li");
		li.className = "todo-item";
		if (task.completed) li.classList.add("is-completed");
		if (task.id === justAddedId) li.classList.add("todo-item--new");
		li.dataset.id = task.id;

		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.className = "todo-item__checkbox";
		checkbox.checked = task.completed;

		const body = document.createElement("div");
		body.className = "todo-item__body";

		const span = document.createElement("span");
		span.className = "todo-item__text";
		span.textContent = task.text;
		body.appendChild(span);

		if (task.priority || task.category || task.dueDate) {
			const meta = document.createElement("div");
			meta.className = "todo-item__meta";

			if (task.priority) {
				const p = document.createElement("span");
				p.className = `badge badge--priority is-${task.priority}`;
				p.textContent = task.priority;
				meta.appendChild(p);
			}
			if (task.category) {
				const c = document.createElement("span");
				c.className = "badge badge--category";
				c.textContent = task.category;
				meta.appendChild(c);
			}
			if (task.dueDate) {
				const d = document.createElement("span");
				d.className = "badge badge--due";
				d.textContent = `📅 ${task.dueDate}`;
				meta.appendChild(d);
			}
			body.appendChild(meta);
		}

		const deleteBtn = document.createElement("button");
		deleteBtn.className = "todo-item__delete";
		deleteBtn.textContent = "×";
		deleteBtn.setAttribute("aria-label", "Delete task");

		li.append(checkbox, body, deleteBtn);
		todoList.appendChild(li);
	}

	function saveTask() {
		localStorage.setItem("tasks", JSON.stringify(tasks));
	}

	function setStatus(message, type) {
		aiStatus.textContent = message;
		aiStatus.className = "ai-setup__status" + (type ? " is-" + type : "");
	}

	function refreshAiStatus() {
		if (AI.isDemo()) {
			setStatus("Demo mode ON — AI is simulated locally (no key needed) ✨", "ok");
		} else if (AI.hasKey()) {
			setStatus("Live AI ON — calling Claude ✅", "ok");
		} else {
			setStatus("AI is off. Turn on Demo mode, or add an API key.", "");
		}
	}

	function setBusy(isBusy, label) {
		addBtn.disabled = isBusy;
		addBtn.textContent = isBusy ? label : "Add";
	}

	let planTimer = null;
	function showPlan(text) {
		if (planTimer) clearInterval(planTimer);
		planOutput.textContent = "";
		planOutput.classList.remove("hidden");
		planOutput.classList.add("is-typing");

		let i = 0;
		planTimer = setInterval(() => {
			i += 2;
			planOutput.textContent = text.slice(0, i);
			if (i >= text.length) {
				planOutput.textContent = text;
				clearInterval(planTimer);
				planTimer = null;
				planOutput.classList.remove("is-typing");
			}
		}, 18);
	}
});
