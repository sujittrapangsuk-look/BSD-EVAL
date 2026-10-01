/**
 * =========================================================================================
 * GOOGLE SHEETS & GOOGLE DRIVE API CLIENT (HYBRID DUAL-MODE)
 * ระบบแบบประเมินผู้เรียนประจำปี โรงเรียนบ้านสันดาบ สพป.สมุทรสาคร
 * =========================================================================================
 * รองรับทั้ง:
 * 1. Google Apps Script Native Environment (google.script.run)
 * 2. External Web / Local Browser (HTTP REST API via fetch)
 * =========================================================================================
 */

const CLOUD_CONFIG = {
  SPREADSHEET_ID: '1tx9-QGCSdUzOtXdkT6mxdYkloCbtrC0-WGbjgBLHg5Q',
  DRIVE_FOLDER_ID: '1Bsru56qKchSlP0imhGnkwIAWu2S4ymvT',
  DEFAULT_WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbzNqS-ZKsCmhv_5BviEPblIQ8_9TNqV5bvF4XLf1UOM6Zb4Q2etuGH3uSBX_aDFMvZd0g/exec',
  SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1tx9-QGCSdUzOtXdkT6mxdYkloCbtrC0-WGbjgBLHg5Q/edit',
  DRIVE_FOLDER_URL: 'https://drive.google.com/drive/folders/1Bsru56qKchSlP0imhGnkwIAWu2S4ymvT',
  STORAGE_KEYS: {
    WEBAPP_URL: 'sandab_gas_webapp_url_2569',
    AUTO_SYNC: 'sandab_gas_auto_sync_enabled',
    LAST_SYNC: 'sandab_gas_last_synced_at'
  }
};

// Safe storage wrapper protecting against iframe storage security errors
const SafeStorage = {
  _mem: {},
  getItem(key) {
    try {
      if (typeof localStorage !== 'undefined') {
        const v = localStorage.getItem(key);
        if (v !== null) return v;
      }
    } catch (e) {}
    return this._mem[key] !== undefined ? this._mem[key] : null;
  },
  setItem(key, val) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, val);
      }
    } catch (e) {}
    this._mem[key] = String(val);
  },
  removeItem(key) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch (e) {}
    delete this._mem[key];
  }
};

class GoogleCloudApi {
  constructor() {
    this.webappUrl = SafeStorage.getItem(CLOUD_CONFIG.STORAGE_KEYS.WEBAPP_URL) || CLOUD_CONFIG.DEFAULT_WEBAPP_URL;
    this.autoSyncEnabled = SafeStorage.getItem(CLOUD_CONFIG.STORAGE_KEYS.AUTO_SYNC) !== 'false';
    this.isSyncing = false;
    this.syncTimer = null;
    this.lastSyncTime = SafeStorage.getItem(CLOUD_CONFIG.STORAGE_KEYS.LAST_SYNC) || null;
  }

  isAppsScriptEnvironment() {
    return typeof google !== 'undefined' && typeof google.script !== 'undefined' && typeof google.script.run !== 'undefined';
  }

  isConfigured() {
    return this.isAppsScriptEnvironment() || (this.webappUrl && this.webappUrl.trim().startsWith('https://script.google.com'));
  }

  setWebappUrl(url) {
    this.webappUrl = (url || '').trim();
    SafeStorage.setItem(CLOUD_CONFIG.STORAGE_KEYS.WEBAPP_URL, this.webappUrl);
    this.updateStatusUI();
  }

  setAutoSync(enabled) {
    this.autoSyncEnabled = !!enabled;
    SafeStorage.setItem(CLOUD_CONFIG.STORAGE_KEYS.AUTO_SYNC, this.autoSyncEnabled ? 'true' : 'false');
    this.updateStatusUI();
  }

  setLastSyncTime() {
    const now = new Date();
    this.lastSyncTime = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' (' + now.toLocaleDateString('th-TH') + ')';
    SafeStorage.setItem(CLOUD_CONFIG.STORAGE_KEYS.LAST_SYNC, this.lastSyncTime);
    this.updateStatusUI();
  }

  /**
   * ทดสอบการเชื่อมต่อ Google Apps Script
   */
  async testConnection() {
    this.setSyncingState(true, 'กำลังทดสอบเชื่อมต่อ Google Cloud...');
    
    // 1. Apps Script Native RPC
    if (this.isAppsScriptEnvironment()) {
      return new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler((res) => {
            this.setSyncingState(false);
            this.setLastSyncTime();
            resolve(res || { status: 'online', success: true });
          })
          .withFailureHandler((err) => {
            this.setSyncingState(false);
            reject(err);
          })
          .pingServer();
      });
    }

    // 2. External HTTP Fetch
    if (!this.isConfigured()) {
      this.setSyncingState(false);
      throw new Error('กรุณาระบุ URL ของ Google Apps Script Web App ให้ถูกต้อง');
    }

    try {
      const url = `${this.webappUrl}?action=ping&t=${Date.now()}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`เชื่อมต่อไม่สำเร็จ HTTP ${response.status}`);
      }

      const result = await response.json();
      this.setSyncingState(false);
      this.setLastSyncTime();
      return result;
    } catch (err) {
      this.setSyncingState(false);
      console.error('Test connection error:', err);
      throw err;
    }
  }

  /**
   * สั่งสร้างและจัดรูปแบบชีตทั้ง 8 ตารางใน Google Sheets แบบอัตโนมัติ
   */
  async initDatabase() {
    this.setSyncingState(true, 'กำลังสร้างโครงสร้างตารางใน Google Sheets...');

    if (this.isAppsScriptEnvironment()) {
      return new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler((res) => {
            this.setSyncingState(false);
            this.setLastSyncTime();
            resolve(res);
          })
          .withFailureHandler((err) => {
            this.setSyncingState(false);
            reject(err);
          })
          .setupDatabase();
      });
    }

    if (!this.isConfigured()) {
      this.setSyncingState(false);
      throw new Error('กรุณาระบุ URL ของ Google Apps Script Web App ก่อนสั่งสร้างฐานข้อมูล');
    }

    try {
      const url = `${this.webappUrl}?action=initDatabase&t=${Date.now()}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`สร้างฐานข้อมูลไม่สำเร็จ HTTP ${response.status}`);
      }

      const result = await response.json();
      this.setSyncingState(false);
      this.setLastSyncTime();
      return result;
    } catch (err) {
      this.setSyncingState(false);
      console.error('Init database error:', err);
      throw err;
    }
  }

  /**
   * ดึงข้อมูลทั้งหมดจาก Google Sheets มาใส่ในแอปพลิเคชัน
   */
  async pullAllData() {
    this.setSyncingState(true, 'กำลังดึงข้อมูลล่าสุดจาก Google Sheets...');

    if (this.isAppsScriptEnvironment()) {
      return new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler((data) => {
            this.setSyncingState(false);
            this.setLastSyncTime();
            resolve(data);
          })
          .withFailureHandler((err) => {
            this.setSyncingState(false);
            reject(err);
          })
          .getAllDataFromSheets();
      });
    }

    if (!this.isConfigured()) {
      this.setSyncingState(false);
      throw new Error('กรุณาตั้งค่า Google Apps Script Web App URL ก่อนดึงข้อมูล');
    }

    try {
      const url = `${this.webappUrl}?action=getAllData&t=${Date.now()}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`ดึงข้อมูลไม่สำเร็จ HTTP ${response.status}`);
      }

      const result = await response.json();
      if (!result.success || !result.data) {
        throw new Error(result.error || 'ไม่พบข้อมูลที่ดึงมา');
      }

      this.setSyncingState(false);
      this.setLastSyncTime();
      return result.data;
    } catch (err) {
      this.setSyncingState(false);
      console.error('Pull data error:', err);
      throw err;
    }
  }

  /**
   * ส่งข้อมูลทั้งหมดจากแอปพลิเคชันขึ้น Google Sheets (Push)
   */
  async pushAllData(appState) {
    this.setSyncingState(true, 'กำลังส่งข้อมูลขึ้น Google Sheets...');
    const payload = {
      action: 'saveAllData',
      operator: 'ผู้ดูแลระบบ',
      academicYear: appState.schoolInfo?.academicYear || '2569',
      semester: appState.schoolInfo?.semester || '1',
      schoolInfo: appState.schoolInfo,
      teachers: appState.teachers,
      students: appState.students,
      readingAssessments: appState.readingAssessments,
      characteristicsAssessments: appState.characteristicsAssessments,
      competenciesAssessments: appState.competenciesAssessments
    };

    if (this.isAppsScriptEnvironment()) {
      return new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler((res) => {
            this.setSyncingState(false);
            this.setLastSyncTime();
            resolve(res);
          })
          .withFailureHandler((err) => {
            this.setSyncingState(false);
            reject(err);
          })
          .saveAllDataToSheets(payload);
      });
    }

    if (!this.isConfigured()) {
      this.setSyncingState(false);
      throw new Error('กรุณาตั้งค่า Google Apps Script Web App URL ก่อนส่งข้อมูล');
    }

    try {
      const response = await fetch(this.webappUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`ส่งข้อมูลไม่สำเร็จ HTTP ${response.status}`);
      }

      const result = await response.json();
      this.setSyncingState(false);
      this.setLastSyncTime();
      return result;
    } catch (err) {
      this.setSyncingState(false);
      console.error('Push data error:', err);
      throw err;
    }
  }

  /**
   * อัปโหลดไฟล์หรือรูปภาพไปยัง Google Drive Folder ID: 1Bsru56qKchSlP0imhGnkwIAWu2S4ymvT
   */
  async uploadFile(base64Data, fileName, mimeType, category = 'general', targetId = '', targetName = '') {
    this.setSyncingState(true, `กำลังอัปโหลดไฟล์ ${fileName} ขึ้น Google Drive...`);
    const params = {
      action: 'uploadFile',
      fileBase64: base64Data,
      fileName: fileName,
      mimeType: mimeType || 'image/jpeg',
      category: category,
      targetId: targetId,
      targetName: targetName,
      operator: 'ผู้ดูแลระบบ'
    };

    if (this.isAppsScriptEnvironment()) {
      return new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler((res) => {
            this.setSyncingState(false);
            resolve(res);
          })
          .withFailureHandler((err) => {
            this.setSyncingState(false);
            reject(err);
          })
          .uploadFileToGoogleDrive(params);
      });
    }

    if (!this.isConfigured()) {
      this.setSyncingState(false);
      throw new Error('กรุณาเชื่อมต่อ Google Apps Script Web App เพื่ออัปโหลดไฟล์ขึ้น Google Drive');
    }

    try {
      const response = await fetch(this.webappUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(params)
      });

      if (!response.ok) {
        throw new Error(`อัปโหลดไฟล์ไม่สำเร็จ HTTP ${response.status}`);
      }

      const result = await response.json();
      this.setSyncingState(false);
      return result;
    } catch (err) {
      this.setSyncingState(false);
      console.error('Upload file error:', err);
      throw err;
    }
  }

  /**
   * ดึงรายการไฟล์หลักฐานจาก Google Drive
   */
  async getFilesList() {
    if (this.isAppsScriptEnvironment()) {
      return new Promise((resolve) => {
        google.script.run
          .withSuccessHandler((res) => {
            resolve(res && res.files ? res.files : []);
          })
          .withFailureHandler(() => {
            resolve([]);
          })
          .getFilesList();
      });
    }

    if (!this.isConfigured()) return [];
    try {
      const url = `${this.webappUrl}?action=getFilesList&t=${Date.now()}`;
      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) return [];
      const result = await response.json();
      return result.files || [];
    } catch (err) {
      console.warn('Cannot fetch files list:', err);
      return [];
    }
  }

  /**
   * Debounced Auto-Sync เมื่อมีการแก้ไขข้อมูล
   */
  scheduleAutoSync(appState, delayMs = 2500) {
    if (!this.isConfigured() || !this.autoSyncEnabled) return;
    
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }

    this.updateStatusUI('pending');

    this.syncTimer = setTimeout(async () => {
      try {
        await this.pushAllData(appState);
        if (typeof showToast === 'function') {
          showToast('ซิงค์ข้อมูลขึ้น Google Sheets อัตโนมัติเรียบร้อย', 'info');
        }
      } catch (err) {
        console.warn('Auto-sync failed in background:', err);
        if (typeof showToast === 'function') {
          showToast('ซิงค์อัตโนมัติไม่สำเร็จ: ' + err.message, 'warning');
        }
      }
    }, delayMs);
  }

  /**
   * ควบคุมสถานะ Syncing
   */
  setSyncingState(isSyncing, message = '') {
    this.isSyncing = isSyncing;
    this.updateStatusUI(isSyncing ? 'syncing' : (this.isConfigured() ? 'online' : 'offline'), message);
  }

  /**
   * อัปเดต UI Badge บน Topbar และ Admin Control Center
   */
  updateStatusUI(customStatus, customMsg) {
    // 1. Topbar Cloud Badge
    const topbarBadge = document.getElementById('topbar-cloud-badge');
    const topbarDot = document.getElementById('topbar-cloud-dot');
    const topbarText = document.getElementById('topbar-cloud-text');

    let status = customStatus || (this.isConfigured() ? 'online' : 'offline');

    if (topbarBadge && topbarDot && topbarText) {
      if (status === 'syncing') {
        topbarBadge.className = 'topbar-cloud-badge badge-syncing';
        topbarDot.className = 'status-dot dot-syncing';
        topbarText.innerHTML = customMsg || '<i class="fa-solid fa-arrows-rotate fa-spin"></i> กำลังซิงค์ข้อมูล...';
      } else if (status === 'pending') {
        topbarBadge.className = 'topbar-cloud-badge badge-pending';
        topbarDot.className = 'status-dot dot-pending';
        topbarText.textContent = 'รอซิงค์อัตโนมัติ...';
      } else if (status === 'online') {
        topbarBadge.className = 'topbar-cloud-badge badge-online';
        topbarDot.className = 'status-dot dot-online';
        topbarText.innerHTML = '<i class="fa-solid fa-cloud-check"></i> Google Sheets: เชื่อมต่อแล้ว';
      } else {
        topbarBadge.className = 'topbar-cloud-badge badge-offline';
        topbarDot.className = 'status-dot dot-offline';
        topbarText.innerHTML = '<i class="fa-solid fa-hard-drive"></i> โหมดออฟไลน์ (LocalStorage)';
      }
    }

    // 2. Admin Tab Badges & Elements
    const adminStatusPill = document.getElementById('admin-cloud-status-pill');
    const adminLastSyncSpan = document.getElementById('admin-cloud-last-sync');
    const adminWebappInput = document.getElementById('admin-gas-webapp-url-input');
    const adminAutoSyncCheckbox = document.getElementById('admin-gas-autosync-toggle');

    if (adminWebappInput && !adminWebappInput.value) {
      adminWebappInput.value = this.webappUrl;
    }
    if (adminAutoSyncCheckbox) {
      adminAutoSyncCheckbox.checked = this.autoSyncEnabled;
    }
    if (adminLastSyncSpan) {
      adminLastSyncSpan.textContent = this.lastSyncTime ? `ซิงค์ล่าสุด: ${this.lastSyncTime}` : 'ยังไม่เคยซิงค์';
    }

    if (adminStatusPill) {
      if (status === 'syncing') {
        adminStatusPill.className = 'admin-status-badge badge-syncing';
        adminStatusPill.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> ' + (customMsg || 'กำลังซิงค์...');
      } else if (status === 'online') {
        adminStatusPill.className = 'admin-status-badge badge-online';
        adminStatusPill.innerHTML = '<span class="admin-status-dot" style="background:#10b981;"></span> Google Sheets & Drive ออนไลน์';
      } else {
        adminStatusPill.className = 'admin-status-badge badge-offline';
        adminStatusPill.innerHTML = '<span class="admin-status-dot" style="background:#f59e0b;"></span> ยังไม่เชื่อมต่อ Web App';
      }
    }
  }
}

// Global Cloud Instance
const cloudApi = new GoogleCloudApi();
window.cloudApi = cloudApi;
window.SafeStorage = SafeStorage;
