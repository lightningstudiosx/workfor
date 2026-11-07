// Shared HR logic for workfor.kaifun.fun: who is hired, fired or blacklisted, ranks, and KaiBucks.
// Everything is worked out from the public issues in the workfor repo, so every page agrees.
const HR = (() => {
  const REPO = 'lightningstudiosx/workfor';
  const RANKS = ['Trainee', 'Programmer', 'Senior Programmer', 'Lead Programmer', 'Head of Code'];
  const KB_PER_PROGRAM = [10, 15, 20, 30, 50]; // KaiBucks per program, by rank
  const KB_HIRE_BONUS = 5;
  const USD_TO_KB = 0; // the official exchange rate: $1 = 0 KB
  const GH_RE = /^[a-z\d](?:[a-z\d-]{0,38})$/i;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = u => /^https?:\/\/[^\s"'<>]+$/i.test(u || '') ? u : null;
  const field = (body, name) => { const m = (body || '').match(new RegExp('\\*\\*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\*\\*\\s*(.*)')); return m ? m[1].trim() : ''; };
  const has = (i, n) => i.labels.some(l => (l.name || l).toLowerCase() === n.toLowerCase());
  const weekNo = d => { d = new Date(d); const j = new Date(d.getFullYear(), 0, 1); return Math.ceil(((d - j) / 864e5 + j.getDay() + 1) / 7); };
  const weekKey = d => new Date(d).getFullYear() + '-' + weekNo(d);
  const fmtD = d => d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const isApp = i => /^Application:/i.test(i.title), isProg = i => /^Program:/i.test(i.title), isBlackIssue = i => /^Blacklist:/i.test(i.title);
  const appGh = i => (field(i.body, 'GitHub').replace(/^@/, '') || i.user.login).toLowerCase();
  const progGh = i => (field(i.body, 'From').replace(/^@/, '') || i.user.login).toLowerCase();
  const rankOf = i => { const l = i.labels.find(l => /^rank: /i.test(l.name)); const k = l ? RANKS.findIndex(r => 'rank: ' + r.toLowerCase() === l.name.toLowerCase()) : 0; return k < 0 ? 0 : k; };
  // a program only counts if the GitHub account that posted it is the one it says it's from
  const progVerified = p => p.user.login.toLowerCase() === progGh(p);

  async function fetchIssues(token) {
    const h = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) h.Authorization = 'Bearer ' + token;
    let all = [];
    for (let p = 1; p <= 10; p++) {
      const r = await fetch(`https://api.github.com/repos/${REPO}/issues?state=all&per_page=100&page=${p}`, { headers: h });
      if (!r.ok) throw new Error(r.status === 403 ? 'GitHub says slow down (too many refreshes). Try again in a few minutes.' : 'GitHub error ' + r.status);
      const got = await r.json(); all = all.concat(got.filter(i => !i.pull_request)); if (got.length < 100) break;
    }
    return all;
  }

  // turn the issues into people
  function model(issues) {
    const apps = issues.filter(isApp), progs = issues.filter(isProg);
    const black = new Set();
    apps.filter(i => has(i, 'blacklisted')).forEach(i => { black.add(appGh(i)); black.add(i.user.login.toLowerCase()); });
    issues.filter(i => isBlackIssue(i) && has(i, 'blacklisted')).forEach(i => black.add(i.title.replace(/^Blacklist:\s*@?/i, '').trim().toLowerCase()));
    const people = {};
    const get = gh => people[gh] || (people[gh] = { gh, apps: [], progs: [], status: 'none', rank: 0, app: null });
    apps.forEach(i => get(appGh(i)).apps.push(i));
    progs.forEach(p => get(progGh(p)).progs.push(p));
    for (const gh in people) {
      const P = people[gh];
      P.apps.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      P.progs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const hiredApp = P.apps.find(i => has(i, 'hired') && !has(i, 'fired'));
      P.app = hiredApp || P.apps[0] || null;
      if (black.has(gh)) P.status = 'blacklisted';
      else if (hiredApp) P.status = 'employee';
      else if (P.apps.some(i => has(i, 'fired'))) P.status = 'fired';
      else if (P.apps.length && P.apps.every(i => has(i, 'rejected') || i.state === 'closed')) P.status = 'rejected';
      else if (P.apps.length) P.status = 'applied';
      P.rank = hiredApp ? rankOf(hiredApp) : 0;
      P.verifiedProgs = P.progs.filter(p => progVerified(p) && !has(p, 'not counted'));
      P.kb = P.status === 'employee' || P.status === 'fired' ? KB_HIRE_BONUS + P.verifiedProgs.length * KB_PER_PROGRAM[P.rank] : 0;
      P.thisWeek = P.verifiedProgs.some(p => weekKey(p.created_at) === weekKey(new Date()));
    }
    for (const gh of black) get(gh).status = 'blacklisted';
    return { people, black, apps, progs };
  }
  return { REPO, RANKS, KB_PER_PROGRAM, KB_HIRE_BONUS, USD_TO_KB, GH_RE, esc, safeUrl, field, has, weekNo, weekKey, fmtD, isApp, isProg, isBlackIssue, appGh, progGh, rankOf, progVerified, fetchIssues, model };
})();
