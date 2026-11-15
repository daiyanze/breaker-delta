'use strict';

// 浪尖雷达 · 浪高徽章（A2 原型）
// 只在 manifest 声明的 5 个站点运行。读取扩展自带的 data/topics.json 与
// data/alerts.json（样例数据；正式版由站点构建时生成），若当前页 URL 或
// 标题命中某个话题，就在页面右下角注入一条不打扰的徽章条。
// 不上报任何浏览数据。

(function () {
  if (document.getElementById('breaker-delta-badge')) return;

  const TOPIC_PAGE_BASE = 'https://daiyanze.github.io/breaker-delta/';

  function matchTopic(topic, url, title) {
    const urlLower = url.toLowerCase();
    const titleLower = title.toLowerCase();
    const byUrl = (topic.url_patterns || []).some(
      (p) => p && urlLower.includes(String(p).toLowerCase())
    );
    if (byUrl) return true;
    return (topic.title_keywords || []).some(
      (k) => k && (titleLower.includes(String(k).toLowerCase()) ||
                    urlLower.includes(String(k).toLowerCase()))
    );
  }

  function renderBadge(topic, alert) {
    if (document.getElementById('breaker-delta-badge')) return;
    const bar = document.createElement('div');
    bar.id = 'breaker-delta-badge';

    const main = document.createElement('span');
    main.className = 'bd-badge-main';
    main.textContent = `🌊 浪尖雷达已收录 · 浪高 ${topic.heat} · 首现 ${topic.first_seen}`;
    bar.appendChild(main);

    if (alert) {
      const breaking = document.createElement('span');
      breaking.className = 'bd-badge-breaking';
      breaking.textContent = '⚡正在破圈';
      bar.appendChild(breaking);
    }

    const link = document.createElement('a');
    link.className = 'bd-badge-link';
    // 占位链接：正式版话题页 URL 由站点构建时的 slug 决定。
    link.href = TOPIC_PAGE_BASE + 'topic-' + topic.slug + '.html';
    link.target = '_blank';
    link.rel = 'noopener noreferrer nofollow';
    link.textContent = '查看话题 →';
    bar.appendChild(link);

    const close = document.createElement('button');
    close.className = 'bd-badge-close';
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', '关闭');
    close.addEventListener('click', () => bar.remove());
    bar.appendChild(close);

    document.documentElement.appendChild(bar);
  }

  async function main() {
    let topics = [];
    let alerts = [];
    try {
      const topicsRes = await fetch(chrome.runtime.getURL('data/topics.json'));
      const topicsData = await topicsRes.json();
      topics = topicsData.topics || [];
    } catch (e) { /* 数据读不到就不显示徽章 */ }
    try {
      const alertsRes = await fetch(chrome.runtime.getURL('data/alerts.json'));
      const alertsData = await alertsRes.json();
      alerts = alertsData.alerts || [];
    } catch (e) { /* alerts 可选 */ }

    const topic = topics.find((t) => matchTopic(t, location.href, document.title));
    if (!topic) return;
    const alert = alerts.find((a) => a.topic_slug === topic.slug);
    renderBadge(topic, alert);
  }

  main();
})();
