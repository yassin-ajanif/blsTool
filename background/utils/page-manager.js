/**
 * PageManager - Minimal page detection and script injection
 */
class PageManager {
  constructor() {
    this.patterns = {};
    this.scripts = {};
    this.loadConfig().then(() => this.init());
  }

  async loadConfig() {
    try {
      const res = await fetch(chrome.runtime.getURL('lib/page-patterns.json'));
      const config = await res.json();

      // Convert pattern strings to RegExp objects
      Object.keys(config.patterns).forEach(key => {
        this.patterns[key] = new RegExp(config.patterns[key], 'i');
      });

      this.scripts = config.scripts;
    } catch (err) {
      console.error('PM: Failed to load config:', err);
    }
  }

  async init() {
    chrome.tabs.onUpdated.addListener((id, info, tab) => {
      if (info.status === 'loading' && tab.url &&
          (tab.url.includes('blsspainmorocco.net') || tab.url.includes('blsportugal.com'))) {
        this.handleTab(id, tab.url);
      }
    });

    chrome.tabs.query({}, tabs => {
      tabs.forEach(tab => {
        if (tab.url && (tab.url.includes('blsspainmorocco.net') || tab.url.includes('blsportugal.com'))) {
          this.handleTab(tab.id, tab.url);
        }
      });
    });
  }

  detect(url) {
    const lower = url.toLowerCase();
    return Object.keys(this.patterns).find(k => this.patterns[k].test(lower)) || null;
  }

  async handleTab(tabId, url) {
    const page = this.detect(url);
    console.log(`PM: ${page || 'BLS'} → Tab ${tabId}`);

    // Get all scripts to inject
    const scriptsToInject = [...(this.scripts.shared || [])];

    // Add page-specific scripts
    if (page) {
      if (this.scripts[page]) scriptsToInject.push(...this.scripts[page]);

      // Add main page script
      const isPortugal = url.includes('blsportugal.com');
      scriptsToInject.push(isPortugal && page === 'visatype' ?
        `portugal/${page}-page` : `spain/${page}-page`);
    }

    // Fetch and inject all scripts immediately
    this.injectScripts(tabId, scriptsToInject);
  }

  async injectScripts(tabId, scripts) {
    for (const script of scripts) {
      try {
        const res = await fetch(chrome.runtime.getURL(`content-scripts/${script}.js`));
        if (res.ok) {
          chrome.tabs.sendMessage(tabId, {
            action: 'injectScript',
            script: await res.text(),
            path: script
          }, () => {
            if (chrome.runtime.lastError) {
              console.log(`PM: ✗ ${script}`);
            } else {
              console.log(`PM: ✓ ${script}`);
            }
          });
        } else {
          console.log(`PM: ✗ ${script} - ${res.status}`);
        }
      } catch {
        console.log(`PM: ✗ ${script}`);
      }
    }
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = PageManager;