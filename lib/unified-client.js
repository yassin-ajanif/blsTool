/**
 * Unified Client System
 * Combines client model and manager with centralized visa configuration
 */

/**
 * Client Model - uses visa configuration for validation
 */
class UnifiedClient {
  constructor(data = {}) {
    this.id = data.id || generateUUID();
    this.name = data.name || '';
    this.email = data.email || '';
    this.password = data.password || '';
    this.app_password = data.app_password || '';
    this.photo = data.photo || null;
    this.fileId = data.fileId || null;
    this.selfie1 = data.selfie1 || null;
    this.selfie1FileId = data.selfie1FileId || null;
    this.selfie2 = data.selfie2 || null;
    this.selfie2FileId = data.selfie2FileId || null;
    this.applicantsCount = data.applicantsCount || 1;
    this.country = data.country || 'Spain';
    this.category = data.category || 'Normal';
    this.location = data.location || '';
    this.visaType = data.visaType || '';
    this.visaSubtype = data.visaSubtype || '';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  validate() {
    const errors = [];

    // Basic validations
    if (!Validate.isNotEmpty(this.name)) {
      errors.push('Name is required');
    }

    if (!Validate.isNotEmpty(this.email)) {
      errors.push('Email is required');
    } else if (!Validate.isValidEmail(this.email)) {
      errors.push('Email format is invalid');
    }

    if (!Validate.isNotEmpty(this.password)) {
      errors.push('Password is required');
    }

    if (isNaN(this.applicantsCount) || this.applicantsCount < 1 || this.applicantsCount > 6) {
      errors.push('Applicants count must be between 1 and 6');
    }

    // Use visa configuration for validation
    const validation = visaConfig.validateVisaConfig(
      this.country,
      this.location,
      this.visaType,
      this.visaSubtype
    );

    if (!validation.valid) {
      errors.push(validation.error);
    }

    if (!visaConfig.validateCategory(this.category)) {
      errors.push(`Invalid category: ${this.category}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  toJSON() {
    // Return all instance properties
    return { ...this };
  }
}

/**
 * Client Manager - manages client storage and operations
 */
class UnifiedClientManager {
  constructor() {
    this.storageKey = 'clients';
  }

  async loadClients() {
    const result = await storage.get(this.storageKey);
    const clients = result[this.storageKey] || [];
    return clients.map(clientData => new UnifiedClient(clientData));
  }

  async getClient(id) {
    const clients = await this.loadClients();
    return clients.find(client => client.id === id) || null;
  }

  async saveClients(clients) {
    const clientsData = clients.map(client => client.toJSON());
    await storage.set({ [this.storageKey]: clientsData });
    return clients;
  }

  async addClient(clientData) {
    // Process images if needed
    if (clientData.photo && clientData.photo.size > 204800) {
      clientData.photo = await this.resizeImage(clientData.photo, 200 * 1024);
    }
    if (clientData.selfie1 && clientData.selfie1.size > 204800) {
      clientData.selfie1 = await this.resizeImage(clientData.selfie1, 200 * 1024);
    }
    if (clientData.selfie2 && clientData.selfie2.size > 204800) {
      clientData.selfie2 = await this.resizeImage(clientData.selfie2, 200 * 1024);
    }

    const newClient = new UnifiedClient(clientData);

    // Validate client data
    const validation = newClient.validate();
    if (!validation.valid) {
      throw new Error(`Invalid client data: ${validation.errors.join(', ')}`);
    }

    // Sync with server first
    const serverSyncSuccess = await this.syncClientToServer(newClient, 'add');

    if (!serverSyncSuccess) {
      throw new Error('Failed to sync client with server. Client not saved locally.');
    }

    // If server sync successful, save locally
    const clients = await this.loadClients();
    clients.push(newClient);

    return this.saveClients(clients);
  }

  async updateClient(updatedClient) {
    const validation = updatedClient.validate();
    if (!validation.valid) {
      throw new Error(`Invalid client data: ${validation.errors.join(', ')}`);
    }

    const clients = await this.loadClients();
    const index = clients.findIndex(client => client.id === updatedClient.id);

    if (index === -1) {
      throw new Error(`Client with ID ${updatedClient.id} not found`);
    }

    // Sync with server first
    const serverSyncSuccess = await this.syncClientToServer(updatedClient, 'update');

    if (!serverSyncSuccess) {
      throw new Error('Failed to sync client with server. Client not updated locally.');
    }

    // If server sync successful, update locally
    updatedClient.updatedAt = new Date().toISOString();
    clients[index] = updatedClient;

    return this.saveClients(clients);
  }

  // Unified sync function that handles all server operations
  async syncWithServer(data, operation = 'add') {
    try {
      // Get token, deviceHash and endpoints from storage
      const storageResult = await storage.get(['auth', 'endpoints']);
      let token = null;
      let deviceHash = null;
      let recordsEndpoint = null;

      if (storageResult && storageResult.auth) {
        token = storageResult.auth.token;
        deviceHash = storageResult.auth.deviceHash;
      } else {
        // Fallback to auth.json if not in storage (token only, no deviceHash fallback)
        try {
          const response = await fetch(chrome.runtime.getURL('auth.json'));
          const authData = await response.json();
          token = authData.token;
        } catch (error) {
          console.error('Failed to load token:', error);
          return { success: false, error: 'Missing authentication credentials' };
        }
      }

      // Get records endpoint from storage
      if (storageResult && storageResult.endpoints && storageResult.endpoints.records) {
        recordsEndpoint = storageResult.endpoints.records;
      } else {
        return { success: false, error: 'Missing records endpoint in storage' };
      }

      if (!token || !deviceHash) {
        return { success: false, error: 'Missing authentication credentials (token and deviceHash required)' };
      }

      // Determine if bulk or single operation
      const isBulk = Array.isArray(data);

      // Build URL and request based on operation type
      let serverUrl;
      let method;
      let requestBody;

      if (isBulk) {
        // Bulk import endpoint
        serverUrl = `${recordsEndpoint}/client?token=${token}&devicehash=${deviceHash}`;
        method = 'POST';
        requestBody = JSON.stringify(data);
      } else {
        // Single client operations
        const client = data;

        if (operation === 'delete') {
          serverUrl = `${recordsEndpoint}/client/${client.id}?token=${token}&devicehash=${deviceHash}`;
          method = 'DELETE';
          requestBody = null;
        } else {
          // Use toJSON for consistent payload structure
          const clientPayload = client.toJSON ? client.toJSON() : client;

          if (operation === 'update') {
            serverUrl = `${recordsEndpoint}/client/${client.id}?token=${token}&devicehash=${deviceHash}`;
          } else {
            serverUrl = `${recordsEndpoint}/client?token=${token}&devicehash=${deviceHash}`;
            clientPayload.operation = operation;
          }

          method = 'POST';
          requestBody = JSON.stringify(clientPayload);
        }
      }

      // Make the request
      const fetchOptions = {
        method: method,
        headers: { 'Content-Type': 'application/json' }
      };

      if (requestBody) {
        fetchOptions.body = requestBody;
      }

      const response = await fetch(serverUrl, fetchOptions);

      if (response.ok) {
        if (isBulk) {
          const result = await response.json();

          // Save all clients locally after successful server sync
          const existingClients = await this.loadClients();

          for (const clientData of data) {
            const client = new UnifiedClient(clientData);
            const existingIndex = existingClients.findIndex(c => c.id === client.id);

            if (existingIndex !== -1) {
              existingClients[existingIndex] = client;
            } else {
              existingClients.push(client);
            }
          }

          await this.saveClients(existingClients);

          return {
            success: true,
            imported: result.imported || data.length,
            updated: result.updated || 0,
            failed: result.failed || 0
          };
        } else {
          console.log(`Client ${operation} synced successfully with server`);
          return { success: true };
        }
      } else {
        const errorText = await response.text();
        console.error(`${isBulk ? 'Bulk import' : 'Server sync'} failed: ${response.status} - ${errorText}`);

        // Delete clients from storage on API failure
        await storage.remove('clients');
        console.log(`🗑️ Removed stale clients data from storage due to ${isBulk ? 'bulk import' : operation} failure`);

        return { success: false, error: `Server error: ${response.status}` };
      }
    } catch (error) {
      console.error(`${Array.isArray(data) ? 'Bulk import' : 'Sync'} error:`, error);
      return { success: false, error: error.message };
    }
  }

  async bulkImportClients(clientsArray) {
    // Use unified sync function for bulk import
    return this.syncWithServer(clientsArray, 'bulk');
  }

  async syncClientToServer(client, operation) {
    // Use unified sync function for single client operations
    const result = await this.syncWithServer(client, operation);
    return result.success;
  }

  async deleteClient(id) {
    const clients = await this.loadClients();
    const clientToDelete = clients.find(client => client.id === id);

    if (!clientToDelete) {
      throw new Error(`Client with ID ${id} not found`);
    }

    // Sync deletion with server first
    const serverSyncSuccess = await this.syncClientToServer(clientToDelete, 'delete');

    if (!serverSyncSuccess) {
      throw new Error('Failed to sync client deletion with server. Client not deleted locally.');
    }

    // If server sync successful, delete locally
    const filteredClients = clients.filter(client => client.id !== id);
    return this.saveClients(filteredClients);
  }

  async searchClients(query) {
    if (!query) {
      return this.loadClients();
    }

    query = query.toLowerCase();
    const clients = await this.loadClients();

    return clients.filter(client => {
      return (
        client.name.toLowerCase().includes(query) ||
        client.email.toLowerCase().includes(query) ||
        client.country.toLowerCase().includes(query) ||
        client.location.toLowerCase().includes(query) ||
        client.visaType.toLowerCase().includes(query) ||
        client.visaSubtype.toLowerCase().includes(query) ||
        client.category.toLowerCase().includes(query)
      );
    });
  }

  async selectClient(id) {
    const clients = await this.loadClients();

    // Verify the client exists
    const client = clients.find(client => client.id === id);
    if (!client) {
      throw new Error(`Client with ID ${id} not found`);
    }

    // Store the selected client ID (this is the only thing needed)
    await storage.set({ 'selectedClientId': id });

    // Trigger time sync
    chrome.runtime.sendMessage({ action: 'triggerTimeSync' }, (response) => {
      if (response && response.success) {
        console.log('Time sync triggered successfully:', response);
      } else {
        console.warn('Time sync trigger failed:', response);
      }
    });

    // Redirect to appropriate login page using visa config
    const loginUrl = visaConfig.getLoginUrl(client.country);
    chrome.tabs.create({ url: loginUrl });

    return client;
  }

  async resizeImage(dataUrl, maxSizeInBytes) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = function() {
        let width = img.width;
        let height = img.height;
        let ratio = 1;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        let dataURL = canvas.toDataURL('image/jpeg', 0.9);

        while (dataURL.length * 0.75 > maxSizeInBytes && ratio > 0.1) {
          ratio -= 0.1;
          width = img.width * ratio;
          height = img.height * ratio;
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
          dataURL = canvas.toDataURL('image/jpeg', 0.9);
        }

        resolve(dataURL);
      };

      img.src = dataUrl;
    });
  }

  // API methods using visa configuration
  getCountries() {
    return visaConfig.getCountries();
  }

  getLocationsByCountry(country) {
    return visaConfig.getLocationsByCountry(country);
  }

  getCategories() {
    return visaConfig.getCategories();
  }

  getVisaTypesByCountryAndLocation(country, location) {
    return visaConfig.getVisaTypes(country, location);
  }

  getVisaSubtypesByCountryLocationAndType(country, location, visaType) {
    return visaConfig.getVisaSubtypes(country, location, visaType);
  }
}

// Create instances for backward compatibility
const Client = UnifiedClient;
const ClientManager = UnifiedClientManager;

// Make classes available globally for browser extension context
if (typeof window !== 'undefined') {
  window.UnifiedClient = UnifiedClient;
  window.UnifiedClientManager = UnifiedClientManager;
  window.Client = Client;
  window.ClientManager = ClientManager;
}

// Export for use in other modules (Node.js context)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UnifiedClient, UnifiedClientManager };
}