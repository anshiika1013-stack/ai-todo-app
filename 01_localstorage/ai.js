const AI = (() => {
	const API_URL = "https://api.anthropic.com/v1/messages";
	const MODEL = "claude-opus-4-8";
	const KEY_STORAGE = "anthropic_api_key";
	const DEMO_STORAGE = "ai_demo_mode";

	function getKey() {
		return localStorage.getItem(KEY_STORAGE) || "";
	}
	function setKey(key) {
		localStorage.setItem(KEY_STORAGE, key.trim());
	}
	function hasKey() {
		return getKey().length > 0;
	}
	function isDemo() {
		const v = localStorage.getItem(DEMO_STORAGE);
		return v === null ? true : v === "true";
	}
	function setDemo(on) {
		localStorage.setItem(DEMO_STORAGE, on ? "true" : "false");
	}
	function enabled() {
		return isDemo() || hasKey();
	}

	async function enrichTask(rawText) {
		if (isDemo()) return mockEnrichTask(rawText);
		return liveEnrichTask(rawText);
	}

	async function planDay(tasks) {
		if (isDemo()) return mockPlanDay(tasks);
		return livePlanDay(tasks);
	}

	function delay(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
	function isoDate(d) {
		return d.toISOString().slice(0, 10);
	}

	function computeDueDate(raw) {
		const t = raw.toLowerCase();
		const now = new Date();
		const addDays = (n) => {
			const d = new Date(now);
			d.setDate(d.getDate() + n);
			return isoDate(d);
		};
		if (/\btoday\b|\btonight\b/.test(t)) return addDays(0);
		if (/\btomorrow\b/.test(t)) return addDays(1);
		if (/\bnext week\b/.test(t)) return addDays(7);
		const inDays = t.match(/\bin (\d+) days?\b/);
		if (inDays) return addDays(parseInt(inDays[1], 10));

		const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
		for (let i = 0; i < 7; i++) {
			if (new RegExp("\\b" + days[i] + "\\b").test(t)) {
				let delta = (i - now.getDay() + 7) % 7;
				if (delta === 0) delta = 7;
				return addDays(delta);
			}
		}
		return "";
	}

	function cleanText(raw) {
		let s = raw
			.replace(/\b(today|tonight|tomorrow)\b/gi, "")
			.replace(/\bnext week\b/gi, "")
			.replace(/\bin \d+ days?\b/gi, "")
			.replace(/\b(on |by |at )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, "")
			.replace(/\bat \d{1,2}(:\d{2})?\s*(am|pm)?\b/gi, "")
			.replace(/\b(urgent|asap|important|critical)\b/gi, "")
			.replace(/\b(maybe|sometime|eventually|whenever|someday)\b/gi, "")
			.replace(/\s{2,}/g, " ")
			.replace(/^[\s:,.\-]+/, "")
			.replace(/[\s:,.\-]+$/, "")
			.trim();
		if (!s) s = raw.trim();
		return s.charAt(0).toUpperCase() + s.slice(1);
	}

	function guessPriority(raw, dueDate) {
		const t = raw.toLowerCase();
		if (/\b(urgent|asap|important|critical|deadline|now)\b/.test(t)) return "high";
		if (/\b(maybe|sometime|eventually|whenever|someday)\b/.test(t)) return "low";
		if (dueDate) {
			const days = (new Date(dueDate) - new Date()) / 86400000;
			if (days <= 1) return "high";
			if (days <= 3) return "medium";
		}
		return "medium";
	}

	const CATEGORY_RULES = [
		["health", /\b(gym|workout|run|doctor|dentist|medicine|meditat|yoga|health|appointment)\b/],
		["finance", /\b(pay|bill|bank|invoice|tax|budget|rent|salary|money)\b/],
		["errands", /\b(buy|grocery|groceries|shop|store|pick ?up|mail|post|laundry|clean)\b/],
		["learning", /\b(study|learn|read|course|practice|homework|assignment|revise|exam)\b/],
		["work", /\b(work|meeting|report|email|client|project|deadline|presentation|slides|boss|deploy|code|standup)\b/],
		["social", /\b(call|mom|dad|friend|birthday|party|dinner|lunch|meet|coffee|family)\b/],
	];
	function guessCategory(raw) {
		const t = raw.toLowerCase();
		for (const [name, re] of CATEGORY_RULES) if (re.test(t)) return name;
		return "personal";
	}

	async function mockEnrichTask(rawText) {
		await delay(1300);
		const dueDate = computeDueDate(rawText);
		return {
			text: cleanText(rawText),
			priority: guessPriority(rawText, dueDate),
			category: guessCategory(rawText),
			dueDate,
		};
	}

	async function mockPlanDay(tasks) {
		await delay(1100);
		const rank = { high: 0, medium: 1, low: 2 };
		const sorted = [...tasks].sort((a, b) => (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1));
		const highCount = tasks.filter((t) => t.priority === "high").length;

		let out = `You have ${tasks.length} task${tasks.length === 1 ? "" : "s"} on your plate`;
		out += highCount
			? `, ${highCount} of them high priority — let's clear those first.\n\n`
			: `. Here's a smooth order to work through them.\n\n`;

		sorted.forEach((t, i) => {
			const reason =
				t.priority === "high"
					? "high priority, do it early"
					: t.dueDate
						? `due ${t.dueDate}`
						: "quick win";
			out += `${i + 1}. ${t.text} — ${reason}\n`;
		});
		out += `\nYou've got this! 💪`;
		return out;
	}

	async function callClaude(body) {
		const res = await fetch(API_URL, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-api-key": getKey(),
				"anthropic-version": "2023-06-01",
				"anthropic-dangerous-direct-browser-access": "true",
			},
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			const detail = await res.text();
			throw new Error(`Claude API ${res.status}: ${detail}`);
		}
		return res.json();
	}

	async function liveEnrichTask(rawText) {
		const today = new Date().toISOString().slice(0, 10);
		const schema = {
			type: "object",
			properties: {
				text: { type: "string" },
				priority: { type: "string", enum: ["high", "medium", "low"] },
				category: { type: "string" },
				dueDate: { type: "string" },
			},
			required: ["text", "priority", "category", "dueDate"],
			additionalProperties: false,
		};
		const data = await callClaude({
			model: MODEL,
			max_tokens: 1024,
			system:
				"You turn a raw to-do note into a structured task. " +
				"Rewrite `text` as a short, clear action and do NOT put dates in it. " +
				"Choose priority (high/medium/low) from urgency and importance. " +
				"Choose ONE lowercase category such as work, personal, health, " +
				"errands, finance, learning, or social. " +
				`Today is ${today}. If the note implies a due date, set dueDate to ` +
				"that date as YYYY-MM-DD; otherwise use an empty string.",
			messages: [{ role: "user", content: rawText }],
			output_config: { format: { type: "json_schema", schema } },
		});
		return JSON.parse(data.content[0].text);
	}

	async function livePlanDay(tasks) {
		const list = tasks
			.map((t) => {
				const bits = [`priority: ${t.priority || "unset"}`, `category: ${t.category || "unset"}`];
				if (t.dueDate) bits.push(`due: ${t.dueDate}`);
				return `- ${t.text} (${bits.join(", ")})`;
			})
			.join("\n");
		const data = await callClaude({
			model: MODEL,
			max_tokens: 1024,
			system:
				"You are a friendly, concise productivity assistant. Given a list " +
				"of open tasks, write a short plan for today: one line summarising " +
				"the day, then a numbered order to tackle the tasks with a brief " +
				"reason for each. Plain text only — no markdown headings.",
			messages: [{ role: "user", content: `Here are my open tasks:\n${list}` }],
		});
		return data.content
			.filter((block) => block.type === "text")
			.map((block) => block.text)
			.join("\n");
	}

	return { getKey, setKey, hasKey, isDemo, setDemo, enabled, enrichTask, planDay };
})();
