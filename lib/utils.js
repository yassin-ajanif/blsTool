/**
 * Utility functions for the extension
 */

// Generate a UUID for IDs
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
  // Debounce function to limit function calls
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  }
  
  // Format date for display
  function formatDate(dateString) {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    return date.toLocaleDateString();
  }
  
  // Safely stringify JSON with circular reference handling
  function safeStringify(obj, indent = 2) {
    const cache = new Set();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (cache.has(value)) {
          return '[Circular]';
        }
        cache.add(value);
      }
      return value;
    }, indent);
  }
  
  // Simple validation functions
  const Validate = {
    isNotEmpty(value) {
      return value !== null && value !== undefined && value.toString().trim() !== '';
    },
    
    isValidUrl(url) {
      try {
        new URL(url);
        return true;
      } catch (e) {
        return false;
      }
    },
    
    isValidPort(port) {
      const numPort = parseInt(port, 10);
      return !isNaN(numPort) && numPort > 0 && numPort <= 65535;
    },
    
    isValidEmail(email) {
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return re.test(email);
    }
  };

  /**
   * Storage Manager - Wrapper for Chrome storage API with Promise support
   */
  class StorageManager {
    constructor() {
      this.storage = chrome.storage.local;
    }

    // Get items from storage
    get(keys) {
      return new Promise((resolve) => {
        this.storage.get(keys, (result) => {
          resolve(result);
        });
      });
    }

    // Set items in storage
    set(items) {
      return new Promise((resolve) => {
        this.storage.set(items, () => {
          resolve(items);
        });
      });
    }

    // Remove items from storage
    remove(keys) {
      return new Promise((resolve) => {
        this.storage.remove(keys, () => {
          resolve();
        });
      });
    }

    // Clear all storage
    clear() {
      return new Promise((resolve) => {
        this.storage.clear(() => {
          resolve();
        });
      });
    }

    // Get all items from storage
    getAll() {
      return new Promise((resolve) => {
        this.storage.get(null, (result) => {
          resolve(result);
        });
      });
    }
  }

  // Create a default storage instance
  const storage = new StorageManager();

  /**
   * TimeSync - Simple Time Sync with trumpserver
   */
  class TimeSync {
    constructor() {
      this.offset = 0;
      this.rtt = 0;
      this.syncInProgress = false;
    }

    async syncTime(timesyncUrl) {
      try {
        if (!timesyncUrl) {
          this.syncInProgress = false;
          return { success: false, error: 'No timesync URL provided' };
        }

        console.log('Starting time synchronization with trumpserver...');

        // Clear existing time sync data before new sync
        await storage.remove(['timeOffset', 'timeRTT', 'timeSyncTimestamp']);
        console.log('Cleared existing time sync data');

        // Try to get a sync with RTT below maximum allowed
        const MAX_RTT = 200; // Maximum acceptable RTT
        const MAX_ATTEMPTS = 15; // Maximum attempts to get good RTT

        let syncData = null;

        for (let i = 0; i < MAX_ATTEMPTS; i++) {
          try {
            const t0 = Date.now();
            const response = await fetch(timesyncUrl, {
              method: 'GET',
              cache: 'no-cache',
              // Add timeout to prevent hanging
              signal: AbortSignal.timeout(500)
            });

            if (!response.ok) continue;

            const serverTimeText = await response.text();
            const t1 = +serverTimeText;
            const t2 = Date.now();
            const rtt = t2 - t0;

            // Accept first sample with RTT below maximum
            if (rtt <= MAX_RTT) {
              syncData = { t0, t1, t2, rtt };
              console.log(`Sync accepted: RTT=${rtt}ms on attempt ${i + 1}`);
              break;
            } else {
              console.log(`RTT too high: ${rtt}ms, retrying...`);
            }
          } catch (err) {
            console.error(`Sync attempt ${i + 1} failed:`, err.message);
          }
        }

        if (!syncData) {
          throw new Error('Could not achieve sync with acceptable RTT');
        }

        // Calculate offset using NTP algorithm
        this.offset = syncData.t1 - ((syncData.t0 + syncData.t2) / 2);
        this.rtt = syncData.rtt;

        console.log(`Sync complete: offset=${this.offset}ms, RTT=${this.rtt}ms`);

        // Save offset and RTT to storage
        await storage.set({
          timeOffset: this.offset,
          timeRTT: this.rtt,
          timeSyncTimestamp: syncData.t1
        });

        this.syncInProgress = false;

        return {
          success: true,
          offset: this.offset,
          rtt: this.rtt
        };
      } catch (error) {
        console.error('Time sync failed:', error);
        this.syncInProgress = false; // Reset immediately so user can retry

        // Try to use cached offset
        const stored = await storage.get(['timeOffset', 'timeRTT']);

        if (stored.timeOffset !== undefined) {
          this.offset = stored.timeOffset;
          this.rtt = stored.timeRTT || 0;
          console.log('Using cached time offset:', this.offset);
          return { success: true, offset: this.offset, rtt: this.rtt, fromCache: true };
        }
        return { success: false, error: error.message };
      }
    }

    async startSync(timesyncUrl) {
      if (this.syncInProgress) {
        console.log('Sync already in progress, skipping...');
        return;
      }

      this.syncInProgress = true;

      // Reset local values since we'll clear storage
      this.offset = 0;
      this.rtt = 0;

      // Start the sync process
      return this.syncTime(timesyncUrl);
    }

    async getOffset() {
      const stored = await storage.get('timeOffset');
      return stored.timeOffset || 0;
    }

    getCurrentTime() {
      return Date.now() + this.offset;
    }

    // Helper methods for time correction
    getServerTime() {
      return Date.now() + this.offset;
    }

    toServerTime(localTime) {
      return localTime + this.offset;
    }

    toLocalTime(serverTime) {
      return serverTime - this.offset;
    }
  }

  // Create global timeSync instance
  const timeSync = new TimeSync();

  // DOM helper functions
  const DOM = {
    // Create element with attributes and properties
    createElement(tag, attributes = {}, properties = {}) {
      const element = document.createElement(tag);
      
      // Set attributes
      Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
      
      // Set properties
      Object.entries(properties).forEach(([key, value]) => {
        element[key] = value;
      });
      
      return element;
    },
    
    // Append multiple children to an element
    appendChildren(parent, children) {
      children.forEach(child => {
        if (child) {
          parent.appendChild(child);
        }
      });
      return parent;
    },
    
    // Show an element
    show(element) {
      if (element) {
        element.style.display = '';
      }
      return element;
    },
    
    // Hide an element
    hide(element) {
      if (element) {
        element.style.display = 'none';
      }
      return element;
    }
  };