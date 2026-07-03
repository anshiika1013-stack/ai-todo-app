document.addEventListener("DOMContentLoaded", () => {
	//grabbing the elements
	//in order to add elements in js we simple use get element by id
	//we will store them in varibles to grab there inputs
	const todoForm = document.getElementById("todo-form");
	const todoInputs = document.getElementById("todo-input");
	const addBtn = document.getElementById("add_cta");
	const todoList = document.getElementById("todo-list");
	const emptyState = document.getElementById("empty-state");
	const itemCount = document.getElementById("item-count");
	const clearCompletedBtn = document.getElementById("clear-completed");
	const filterButtons = document.querySelectorAll(".filter");

	//AI-related elements
	const demoToggle = document.getElementById("demo-mode");
	const apiKeyInput = document.getElementById("api-key-input");
	const saveKeyBtn = document.getElementById("save-key");
	const aiStatus = document.getElementById("ai-status");
	const aiAnalyzing = document.getElementById("ai-analyzing");
	const planDayBtn = document.getElementById("plan-day");
	const planOutput = document.getElementById("plan-output");

	//id of the task we JUST added — used to animate only that one item in
	let justAddedId = null;

	//we want to store the tasks so we will use arrays
	//load whatever was saved last time. if nothing is saved getItem returns
	//null, and (null || []) falls back to an empty array
	let tasks = JSON.parse(localStorage.getItem("tasks")) || [];
	let currentFilter = "all"; // "all" | "active" | "completed"

	//first paint: draw whatever we loaded, and reflect the saved settings
	render();
	if (AI.hasKey()) apiKeyInput.value = AI.getKey();
	demoToggle.checked = AI.isDemo();
	refreshAiStatus();

	// ==========================================================
	//  ADD A TASK  (natural language + auto priority/category via AI)
	// ==========================================================
	//we listen on the FORM's submit event so it fires for the Add button AND
	//the Enter key, and preventDefault stops the page from reloading.
	todoForm.addEventListener("submit", async (e) => {
		e.preventDefault();

		const rawText = todoInputs.value.trim();
		if (rawText === "") return; //ignore empty input

		//clear the box straight away so it feels responsive
		todoInputs.value = "";

		//start from a plain task. if AI is on we'll upgrade it below.
		let newTask = {
			id: Date.now(),
			text: rawText,
			completed: false,
			priority: "",
			category: "",
			dueDate: "",
		};

		//call the AI when it's enabled (demo mode OR a real key)
		if (AI.enabled()) {
			setBusy(true, "✦ Thinking…");
			aiAnalyzing.classList.remove("hidden"); //show the shimmering bar
			try {
				//ONE call returns the cleaned text + priority + category + due date
				const info = await AI.enrichTask(rawText);
				newTask.text = info.text || rawText;
				newTask.priority = info.priority || "";
				newTask.category = info.category || "";
				newTask.dueDate = info.dueDate || "";
				refreshAiStatus();
			} catch (err) {
				//AI failed (bad key, no network, etc.) — keep the plain task
				console.error(err);
				setStatus("AI call failed — added as a plain task. " + err.message, "err");
			} finally {
				setBusy(false);
				aiAnalyzing.classList.add("hidden"); //hide the bar
			}
		}

		//push -> save -> redraw (single source of truth)
		//mark this task as "just added" so render() animates only it
		justAddedId = newTask.id;
		tasks.push(newTask);
		saveTask();
		render();
		justAddedId = null; //reset so later re-renders don't re-animate
	});

	// ==========================================================
	//  TOGGLE COMPLETE + DELETE  (event delegation)
	// ==========================================================
	//one listener on the whole list figures out what was clicked. this also
	//works for items that are added later.
	todoList.addEventListener("click", (e) => {
		const li = e.target.closest(".todo-item");
		if (!li) return;

		const id = Number(li.dataset.id); //the id we stashed on the <li>

		//clicked the × delete button -> remove that task from the array
		if (e.target.classList.contains("todo-item__delete")) {
			tasks = tasks.filter((task) => task.id !== id);
			saveTask();
			render();
			return;
		}

		//clicked the checkbox -> flip that task's completed flag
		if (e.target.classList.contains("todo-item__checkbox")) {
			const task = tasks.find((task) => task.id === id);
			if (task) task.completed = !task.completed;
			saveTask();
			render();
		}
	});

	// ==========================================================
	//  FILTERS  (All / Active / Completed)
	// ==========================================================
	filterButtons.forEach((button) => {
		button.addEventListener("click", () => {
			currentFilter = button.dataset.filter;
			filterButtons.forEach((b) => b.classList.remove("is-active"));
			button.classList.add("is-active");
			render();
		});
	});

	//clear all completed tasks at once
	clearCompletedBtn.addEventListener("click", () => {
		tasks = tasks.filter((task) => !task.completed);
		saveTask();
		render();
	});

	// ==========================================================
	//  AI SETTINGS  (demo toggle + save the API key)
	// ==========================================================
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

	// ==========================================================
	//  PLAN MY DAY  (AI summary of open tasks)
	// ==========================================================
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

	// ==========================================================
	//  RENDERING
	// ==========================================================
	//rebuild the whole visible list from the tasks array. golden rule: never
	//hand-edit the DOM to add/remove todos — change the array, then render().
	function render() {
		const visibleTasks = tasks.filter((task) => {
			if (currentFilter === "active") return !task.completed;
			if (currentFilter === "completed") return task.completed;
			return true; // "all"
		});

		todoList.innerHTML = "";
		visibleTasks.forEach((task) => renderTask(task));

		//show the empty-state message only when there are zero tasks
		emptyState.classList.toggle("hidden", tasks.length > 0);

		//update the "N items left" counter (counts tasks that are NOT done)
		const remaining = tasks.filter((task) => !task.completed).length;
		itemCount.textContent = `${remaining} item${remaining === 1 ? "" : "s"} left`;
	}

	//build ONE <li> for a single task and append it to the list
	function renderTask(task) {
		const li = document.createElement("li");
		li.className = "todo-item";
		if (task.completed) li.classList.add("is-completed");
		if (task.id === justAddedId) li.classList.add("todo-item--new"); //animate in
		li.dataset.id = task.id;

		//checkbox
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.className = "todo-item__checkbox";
		checkbox.checked = task.completed;

		//body wraps the text and the AI badges (priority / category / due date)
		const body = document.createElement("div");
		body.className = "todo-item__body";

		const span = document.createElement("span");
		span.className = "todo-item__text";
		span.textContent = task.text; //textContent, so typed text can't inject HTML
		body.appendChild(span);

		//only build the meta row if the AI added any info
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

		//delete button
		const deleteBtn = document.createElement("button");
		deleteBtn.className = "todo-item__delete";
		deleteBtn.textContent = "×";
		deleteBtn.setAttribute("aria-label", "Delete task");

		li.append(checkbox, body, deleteBtn);
		todoList.appendChild(li);
	}

	// ==========================================================
	//  SMALL HELPERS
	// ==========================================================
	//save the tasks array to localStorage as a string
	function saveTask() {
		localStorage.setItem("tasks", JSON.stringify(tasks));
	}

	//show a status message under the AI settings (type: "ok" | "err" | "")
	function setStatus(message, type) {
		aiStatus.textContent = message;
		aiStatus.className = "ai-setup__status" + (type ? " is-" + type : "");
	}

	//show the current AI mode in the status line
	function refreshAiStatus() {
		if (AI.isDemo()) {
			setStatus("Demo mode ON — AI is simulated locally (no key needed) ✨", "ok");
		} else if (AI.hasKey()) {
			setStatus("Live AI ON — calling Claude ✅", "ok");
		} else {
			setStatus("AI is off. Turn on Demo mode, or add an API key.", "");
		}
	}

	//disable/enable the Add button while the AI is working
	function setBusy(isBusy, label) {
		addBtn.disabled = isBusy;
		addBtn.textContent = isBusy ? label : "Add";
	}

	//show the day plan with a typewriter effect (reads as the AI "writing")
	let planTimer = null;
	function showPlan(text) {
		if (planTimer) clearInterval(planTimer); //cancel any previous run
		planOutput.textContent = "";
		planOutput.classList.remove("hidden");
		planOutput.classList.add("is-typing"); // shows the blinking cursor

		let i = 0;
		planTimer = setInterval(() => {
			i += 2; // reveal a couple of characters per tick so it stays snappy
			planOutput.textContent = text.slice(0, i);
			if (i >= text.length) {
				planOutput.textContent = text;
				clearInterval(planTimer);
				planTimer = null;
				planOutput.classList.remove("is-typing"); // hide the cursor when done
			}
		}, 18);
	}
});
