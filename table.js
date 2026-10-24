(() => {
	const STORAGE_KEY = "booyah-board-tournament-v1";
	const PLACEMENT_POINTS = [12, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0];
	const TEAM_NAMES = [
		"TEAM ALPHA", "TEAM PHOENIX", "TEAM VIPER", "TEAM TITANS", "TEAM NOVA",
		"TEAM WOLVES", "TEAM FALCON", "TEAM VENOM", "TEAM SHADOW", "TEAM ORBIT",
		"TEAM RAVENS", "TEAM REBELS", "TEAM COBRA", "TEAM LEGENDS", "TEAM STORM",
	];

	function makeTeams(count) {
		return TEAM_NAMES.slice(0, count).map((name, index) => ({ id: index, name, placement: "", kills: 0 }));
	}

	function makeInitialState() {
		return { teamCount: 12, matches: [{ teams: makeTeams(12) }], currentMatch: 0, teamLogos: {} };
	}

	function readState() {
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
			if (![12, 15].includes(saved?.teamCount) || !Array.isArray(saved.matches) || !saved.matches.length) return makeInitialState();
			const count = saved.teamCount;
			const matches = saved.matches.map((match) => ({
				teams: makeTeams(count).map((team) => {
					const entry = match.teams?.find((candidate) => candidate.id === team.id);
					return {
						...team,
						name: typeof entry?.name === "string" ? entry.name.slice(0, 22) : team.name,
						placement: entry?.placement === "" ? "" : Number.isInteger(Number(entry?.placement)) && Number(entry?.placement) >= 1 && Number(entry?.placement) <= count ? Number(entry.placement) : "",
						kills: Math.max(0, Math.floor(Number(entry?.kills) || 0)),
					};
				}),
			}));
			const teamLogos = Object.fromEntries(Object.entries(saved.teamLogos || {}).filter(([id, logo]) => Number(id) >= 0 && Number(id) < count && typeof logo === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(logo) && logo.length <= 600000));
			return { teamCount: count, matches, currentMatch: Math.max(0, Math.min(Number(saved.currentMatch) || 0, matches.length - 1)), teamLogos };
		} catch {
			return makeInitialState();
		}
	}

	let state = readState();
	const $ = (selector) => document.querySelector(selector);
	const teamCountSelect = $("#teamCount");
	const matchSelect = $("#matchSelect");
	const matchRows = $("#matchRows");
	const standingsRows = $("#standingsRows");
	const logoUpload = $("#logoUpload");
	let selectedLogoTeam = null;

	function pointsFor(team) {
		const placePoints = team.placement ? (PLACEMENT_POINTS[team.placement - 1] || 0) : 0;
		return placePoints + team.kills;
	}

	function save() {
		try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Le suivi reste actif en mémoire si le stockage n'est pas disponible. */ }
	}

	function escapeHtml(value) {
		return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
	}

	function teamLogo(teamId, name, className) {
		const logo = state.teamLogos?.[teamId];
		const content = logo ? `<img src="${logo}" alt="">` : escapeHtml(name.trim().charAt(0).toUpperCase() || "#");
		return `<button class="${className}" type="button" data-logo-team="${teamId}" aria-label="Ajouter ou modifier le logo de ${escapeHtml(name)}" title="Ajouter ou modifier le logo">${content}</button>`;
	}

	function refreshMatchOptions() {
		matchSelect.innerHTML = state.matches.map((_, index) => `<option value="${index}">Match ${String(index + 1).padStart(2, "0")}</option>`).join("");
		matchSelect.value = String(state.currentMatch);
	}

	function renderMatch() {
		const match = state.matches[state.currentMatch];
		const rows = match.teams.map((team) => ({ ...team, total: pointsFor(team) }));
		rows.sort((a, b) => b.total - a.total || (a.placement || state.teamCount + 1) - (b.placement || state.teamCount + 1) || a.id - b.id);

		matchRows.innerHTML = rows.map((team, index) => `
			<tr>
				<td class="rank-cell ${index < 3 ? "rank-medal" : ""}">${String(index + 1).padStart(2, "0")}</td>
				<td><div class="team-cell">${teamLogo(team.id, team.name, "team-badge")}<input class="team-input" data-team="${team.id}" data-field="name" aria-label="Nom de l'équipe ${team.id + 1}" maxlength="22" value="${escapeHtml(team.name)}"></div></td>
				<td class="center-col"><select class="number-input" data-team="${team.id}" data-field="placement" aria-label="Placement de ${escapeHtml(team.name)}"><option value="">—</option>${Array.from({ length: state.teamCount }, (_, i) => `<option value="${i + 1}" ${team.placement === i + 1 ? "selected" : ""}>${i + 1}${i === 0 ? "er" : "e"}</option>`).join("")}</select></td>
				<td class="center-col"><input class="number-input" type="number" min="0" step="1" inputmode="numeric" data-team="${team.id}" data-field="kills" aria-label="Kills de ${escapeHtml(team.name)}" value="${team.kills}"></td>
				<td class="placement-points-cell">${team.placement ? (PLACEMENT_POINTS[team.placement - 1] || 0) : "—"}</td>
				<td class="total-col"><span class="total-pill">${team.total}</span></td>
			</tr>`).join("");

		const kills = match.teams.reduce((sum, team) => sum + team.kills, 0);
		const leader = rows[0];
		$("#currentMatchStat").textContent = `MATCH ${String(state.currentMatch + 1).padStart(2, "0")}`;
		$("#teamStat").innerHTML = `${state.teamCount} <small>ÉQUIPES</small>`;
		$("#killStat").innerHTML = `${kills} <small>KILLS</small>`;
		$("#leaderStat").textContent = leader && leader.total > 0 ? leader.name : "—";
		$("#matchHeading").textContent = `Classement du match ${String(state.currentMatch + 1).padStart(2, "0")}`;
		$("#matchFoot").textContent = `MATCH ${String(state.currentMatch + 1).padStart(2, "0")} · ${state.teamCount} ÉQUIPES`;
	}

	function renderStandings() {
		const totals = makeTeams(state.teamCount).map((team) => {
			let points = 0;
			let kills = 0;
			let played = 0;
			let topWins = 0;
			let name = team.name;
			state.matches.forEach((match) => {
				const result = match.teams.find((entry) => entry.id === team.id);
				if (!result) return;
				name = result.name || name;
				points += pointsFor(result);
				kills += result.kills;
				if (result.placement === 1) topWins += 1;
				if (result.placement || result.kills > 0) played += 1;
			});
			return { ...team, name, points, kills, played, topWins };
		}).sort((a, b) => b.points - a.points || b.kills - a.kills || a.id - b.id);

		standingsRows.innerHTML = totals.map((team, index) => `
			<div class="standing-row"><span class="standing-rank ${index < 3 ? "top-rank" : ""}">${String(index + 1).padStart(2, "0")}</span>${teamLogo(team.id, team.name, "standing-logo")}<span class="standing-name">${escapeHtml(team.name)}</span><span class="standing-stars" aria-label="${team.topWins} victoire${team.topWins === 1 ? "" : "s"} en première place">${"★".repeat(team.topWins)}</span><span class="standing-detail">${team.played} match${team.played === 1 ? "" : "s"} · ${team.kills} kills</span><span class="standing-total">${team.points}</span></div>`).join("");
	}

	async function resizeLogo(file) {
		let image;
		if (typeof createImageBitmap === "function") {
			image = await createImageBitmap(file);
		} else {
			image = await new Promise((resolve, reject) => {
				const preview = new Image();
				preview.onload = () => resolve(preview);
				preview.onerror = reject;
				preview.src = URL.createObjectURL(file);
			});
		}
		const canvas = document.createElement("canvas");
		canvas.width = 128;
		canvas.height = 128;
		const size = Math.min(image.width, image.height);
		const left = (image.width - size) / 2;
		const top = (image.height - size) / 2;
		canvas.getContext("2d").drawImage(image, left, top, size, size, 0, 0, 128, 128);
		if (typeof image.close === "function") image.close();
		return canvas.toDataURL("image/png");
	}

	function render() {
		teamCountSelect.value = String(state.teamCount);
		refreshMatchOptions();
		renderMatch();
		renderStandings();
		save();
	}

	function updateTeam(target) {
		const teamId = Number(target.dataset.team);
		const field = target.dataset.field;
		const team = state.matches[state.currentMatch].teams.find((entry) => entry.id === teamId);
		if (!team) return;

		if (field === "name") {
			team.name = target.value.slice(0, 22);
			if (!state.teamLogos?.[team.id]) target.previousElementSibling.textContent = team.name.trim().charAt(0).toUpperCase() || "#";
			const currentRows = state.matches[state.currentMatch].teams;
			const leader = [...currentRows].sort((a, b) => pointsFor(b) - pointsFor(a) || (a.placement || state.teamCount + 1) - (b.placement || state.teamCount + 1) || a.id - b.id)[0];
			$("#leaderStat").textContent = leader && pointsFor(leader) > 0 ? leader.name : "—";
			renderStandings();
			save();
			return;
		} else if (field === "kills") {
			team.kills = Math.max(0, Math.floor(Number(target.value) || 0));
			target.value = String(team.kills);
		} else if (field === "placement") {
			team.placement = target.value ? Number(target.value) : "";
		}
		render();
	}

	matchRows.addEventListener("input", (event) => {
		if (event.target.matches("[data-field='name'], [data-field='kills']")) updateTeam(event.target);
	});
	matchRows.addEventListener("change", (event) => {
		if (event.target.matches("[data-field='placement']")) updateTeam(event.target);
	});

	document.addEventListener("click", (event) => {
		const logoButton = event.target.closest("[data-logo-team]");
		if (!logoButton) return;
		selectedLogoTeam = Number(logoButton.dataset.logoTeam);
		logoUpload.click();
	});

	logoUpload.addEventListener("change", async () => {
		const file = logoUpload.files[0];
		if (!file || selectedLogoTeam === null) return;
		const teamId = selectedLogoTeam;
		selectedLogoTeam = null;
		logoUpload.value = "";
		if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
			window.alert("Choisis une image de 10 Mo maximum.");
			return;
		}
		try {
			state.teamLogos[teamId] = await resizeLogo(file);
			render();
		} catch {
			window.alert("Cette image n'a pas pu être chargée. Essaie un autre fichier.");
		}
	});

	matchSelect.addEventListener("change", () => {
		state.currentMatch = Number(matchSelect.value) || 0;
		render();
	});

	$("#addMatch").addEventListener("click", () => {
		state.matches.push({ teams: makeTeams(state.teamCount).map((team) => ({ ...team })) });
		state.currentMatch = state.matches.length - 1;
		render();
		$("#matchHeading").scrollIntoView({ behavior: "smooth", block: "center" });
	});

	teamCountSelect.addEventListener("change", () => {
		const newCount = Number(teamCountSelect.value);
		if (![12, 15].includes(newCount) || newCount === state.teamCount) return;
		const addedNames = TEAM_NAMES.slice(state.teamCount, newCount);
		state.matches.forEach((match) => {
			if (newCount > state.teamCount) {
				addedNames.forEach((name, index) => match.teams.push({ id: state.teamCount + index, name, placement: "", kills: 0 }));
			} else {
				match.teams = match.teams.filter((team) => team.id < newCount).map((team) => ({ ...team, placement: team.placement > newCount ? "" : team.placement }));
			}
		});
		state.teamCount = newCount;
		render();
	});

	$("#resetTournament").addEventListener("click", () => {
		if (!window.confirm("Effacer tous les matchs et résultats de ce tournoi ?")) return;
		state = makeInitialState();
		render();
	});

	$("#placementPoints").innerHTML = PLACEMENT_POINTS.slice(0, 12).map((points, index) => `<div class="placement-chip ${index === 0 ? "first-place" : ""}"><span>${index + 1}${index === 0 ? "er" : "e"}</span><strong>${points}</strong></div>`).join("");
	render();
})();
