/**
 * ระบบแบบประเมินผู้เรียนประจำปี
 * โรงเรียนบ้านสันดาบ สังกัดสำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร
 */

let state = {
  schoolInfo: {},
  teachers: [],
  teacherInfo: {},
  students: [],
  readingAssessments: {},
  characteristicsAssessments: {},
  competenciesAssessments: {}
};

const STORAGE_KEY = 'obec_student_eval_sandab_2569';
let tempParsedStudents = [];

function initApp() {
  try {
    loadData();
    setupNavigation();
    setupSchoolForm();
    setupStudentSearch();
    setupDragAndDrop();
    setupGradeDropdown();
    renderAll();
    if (window.cloudApi) {
      window.cloudApi.updateStatusUI();
      // Auto-pull live cloud data from Google Sheets in background on startup
      setTimeout(() => {
        checkAndAutoPullFromCloud();
      }, 400);
    }
  } catch (err) {
    console.error('App init error:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  // DOM already loaded (common inside Google Apps Script iframe)
  initApp();
}

function toggleMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.classList.toggle('mobile-open');
  }
}

async function checkAndAutoPullFromCloud() {
  if (!window.cloudApi || !window.cloudApi.isConfigured()) return;
  try {
    const cloudData = await window.cloudApi.pullAllData();
    if (cloudData && cloudData.students && Array.isArray(cloudData.students) && cloudData.students.length > 0) {
      if (cloudData.schoolInfo && Object.keys(cloudData.schoolInfo).length > 0) state.schoolInfo = cloudData.schoolInfo;
      if (cloudData.teachers && cloudData.teachers.length > 0) state.teachers = cloudData.teachers;
      if (cloudData.students && cloudData.students.length > 0) state.students = cloudData.students;
      if (cloudData.readingAssessments) state.readingAssessments = cloudData.readingAssessments;
      if (cloudData.characteristicsAssessments) state.characteristicsAssessments = cloudData.characteristicsAssessments;
      if (cloudData.competenciesAssessments) state.competenciesAssessments = cloudData.competenciesAssessments;
      
      if (window.SafeStorage) {
        window.SafeStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } else {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
      }
      renderAll();
      updateDashboardKpis();
      if (typeof showToast === 'function') {
        showToast('☁️ ซิงค์ข้อมูลล่าสุดจาก Google Sheets สำเร็จ', 'success');
      }
    }
  } catch (err) {
    console.log('Background cloud pull notice:', err.message);
  }
}

/* ==========================================================================
   1. Data & State Storage
   ========================================================================== */
function loadData() {
  let saved = null;
  if (window.SafeStorage) {
    saved = window.SafeStorage.getItem(STORAGE_KEY);
  } else {
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
  }

  if (saved) {
    try {
      if (/[\u0E40-\u0E44][\u0E18\u0E19]|[\u0080-\u009F]|\uFFFD/.test(saved)) {
        console.warn('Detected corrupted encoding in localStorage, resetting to authentic default data.');
        state = JSON.parse(JSON.stringify(DEFAULT_APP_DATA));
        window.state = state;
        saveData(false);
        return;
      }
      state = JSON.parse(saved);
      // Migrate / Ensure required structures
      if (!state.schoolInfo || state.schoolInfo.schoolName !== 'โรงเรียนบ้านสันดาบ') {
        state.schoolInfo = {
          ...DEFAULT_APP_DATA.schoolInfo,
          ...(state.schoolInfo || {}),
          schoolName: 'โรงเรียนบ้านสันดาบ',
          areaZone: 'สังกัดสำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร',
          directorName: 'นายกฤษฎา ผลพล',
          directorPhone: '081-194-1990'
        };
      } else {
        if (!state.schoolInfo.directorName || state.schoolInfo.directorName === 'นายสมศักดิ์ พัฒนาการ') {
          state.schoolInfo.directorName = 'นายกฤษฎา ผลพล';
          state.schoolInfo.directorPhone = '081-194-1990';
        }
      }

      // Always ensure teacher photos match official files in DEFAULT_APP_DATA
      if (!state.teachers || !Array.isArray(state.teachers) || state.teachers.length < DEFAULT_APP_DATA.teachers.length || (state.teachers[0] && state.teachers[0].firstName === 'กมลวรรณ') || (state.teachers[0] && state.teachers[0].avatar && state.teachers[0].avatar.includes('unsplash'))) {
        state.teachers = JSON.parse(JSON.stringify(DEFAULT_APP_DATA.teachers));
      } else {
        state.teachers.forEach(t => {
          const defaultMatch = DEFAULT_APP_DATA.teachers.find(dt => dt.id === t.id || (dt.firstName === t.firstName && dt.lastName === t.lastName) || dt.firstName === t.firstName);
          if (defaultMatch) {
            if (!t.avatar || t.avatar.includes('unsplash') || t.avatar.includes('svg') || t.avatar === '' || t.avatar.startsWith('images/personnel/')) {
              t.avatar = defaultMatch.avatar;
            }
          }
          if (t.id === 1 && (!t.academicRank || t.academicRank === '')) {
            t.academicRank = "ชำนาญการพิเศษ";
          }
        });
        saveData(false);
      }

      if (state.schoolInfo && (!state.schoolInfo.directorAvatar || state.schoolInfo.directorAvatar === 'images/school_logo.png')) {
        state.schoolInfo.directorAvatar = 'images/personnel/director_krisada.jpg';
      }

      // Ensure gradeLevel is valid Primary 1-6 or ทั้งหมด
      const validGrades = ['ประถมศึกษาปีที่ 1', 'ประถมศึกษาปีที่ 2', 'ประถมศึกษาปีที่ 3', 'ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6', 'ทั้งหมด'];
      if (!state.schoolInfo || !validGrades.includes(state.schoolInfo.gradeLevel)) {
        state.schoolInfo = {
          ...(state.schoolInfo || {}),
          gradeLevel: 'ประถมศึกษาปีที่ 1'
        };
      }

      // Build student code to correct grade map from default dataset
      const codeToGradeMap = {};
      if (typeof rawStudentData !== 'undefined' && Array.isArray(rawStudentData)) {
        rawStudentData.forEach(item => {
          codeToGradeMap[item.code] = item.grade;
        });
      }

      // If state students are old 32 dummy students, load full authentic 101 students
      if (!state.students || !Array.isArray(state.students) || state.students.length <= 32 || (state.students[0] && state.students[0].studentCode === '69001')) {
        state.students = JSON.parse(JSON.stringify(DEFAULT_APP_DATA.students));
        state.readingAssessments = JSON.parse(JSON.stringify(DEFAULT_APP_DATA.readingAssessments));
        state.characteristicsAssessments = JSON.parse(JSON.stringify(DEFAULT_APP_DATA.characteristicsAssessments));
        state.competenciesAssessments = JSON.parse(JSON.stringify(DEFAULT_APP_DATA.competenciesAssessments));
        // Auto-correct any student whose gradeLevel was mistakenly set to ป.1 during previous import
        let needsSave = false;
        const gradeCounters = {};
        state.students.forEach(st => {
          if (st.studentCode && codeToGradeMap[st.studentCode] && st.gradeLevel !== codeToGradeMap[st.studentCode]) {
            st.gradeLevel = codeToGradeMap[st.studentCode];
            needsSave = true;
          }
          if (!st.gradeLevel) {
            st.gradeLevel = state.schoolInfo.gradeLevel || 'ประถมศึกษาปีที่ 1';
            needsSave = true;
          }
          const g = st.gradeLevel || 'ประถมศึกษาปีที่ 1';
          gradeCounters[g] = (gradeCounters[g] || 0) + 1;
          if (!st.studentNumber || st.studentNumber === '' || st.studentNumber === '-') {
            st.studentNumber = gradeCounters[g];
            needsSave = true;
          }
        });
        if (needsSave) {
          saveData(false);
        }
      }
    } catch (e) {
      console.error('Data error, falling back to defaults', e);
      state = JSON.parse(JSON.stringify(DEFAULT_APP_DATA));
    }
  } else {
    state = JSON.parse(JSON.stringify(DEFAULT_APP_DATA));
  }
  window.state = state;
}

function saveData(notify = true) {
  window.state = state;
  if (window.SafeStorage) {
    window.SafeStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } else {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  if (notify) {
    showToast('บันทึกข้อมูลเรียบร้อยแล้ว', 'success');
  }
  updateDashboardKpis();
  if (window.cloudApi && typeof window.cloudApi.scheduleAutoSync === 'function') {
    window.cloudApi.scheduleAutoSync(state);
  }
}

/* ==========================================================================
   2. Navigation (7 Slots)
   ========================================================================== */
function setupNavigation() {
  const navItems = document.querySelectorAll('.menu-item');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = item.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  const navItems = document.querySelectorAll('.menu-item');
  const tabPanes = document.querySelectorAll('.tab-pane');

  // Close mobile sidebar if open
  const sidebar = document.querySelector('.sidebar');
  if (sidebar && sidebar.classList.contains('mobile-open')) {
    sidebar.classList.remove('mobile-open');
  }

  navItems.forEach(item => {
    if (item.getAttribute('data-tab') === tabId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  tabPanes.forEach(pane => {
    if (pane.id === tabId) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (tabId === 'tab-students') {
    renderStudentsTable();
  } else if (tabId === 'tab-reading') {
    renderReadingTable();
  } else if (tabId === 'tab-characteristics') {
    renderCharacteristicsTable();
  } else if (tabId === 'tab-competencies') {
    renderCompetenciesTable();
  } else if (tabId === 'tab-report') {
    renderReportTable();
  } else if (tabId === 'tab-home') {
    updateDashboardKpis();
  } else if (tabId === 'tab-admin') {
    renderAdminDashboard();
  }
}

/* ==========================================================================
   3. Render Core Views
   ========================================================================== */
function renderAll() {
  const renderSteps = [
    { name: 'renderHeaderInfo', fn: renderHeaderInfo },
    { name: 'renderTeacherCards', fn: renderTeacherCards },
    { name: 'renderSchoolForm', fn: renderSchoolForm },
    { name: 'renderStudentsTable', fn: renderStudentsTable },
    { name: 'renderReadingTable', fn: renderReadingTable },
    { name: 'renderCharacteristicsTable', fn: renderCharacteristicsTable },
    { name: 'renderCompetenciesTable', fn: renderCompetenciesTable },
    { name: 'renderReportTable', fn: renderReportTable },
    { name: 'renderAdminDashboard', fn: renderAdminDashboard },
    { name: 'updateGradeDisplay', fn: updateGradeDisplay },
    { name: 'updateDashboardKpis', fn: updateDashboardKpis }
  ];

  renderSteps.forEach(step => {
    try {
      if (typeof step.fn === 'function') step.fn();
    } catch (err) {
      console.warn('Render notice (' + step.name + '):', err);
    }
  });
}

function getGradeTeachers(grade) {
  if (!state.teachers || !Array.isArray(state.teachers) || state.teachers.length === 0) {
    return [{ prefix: 'นางสาว', firstName: 'สุวรรณี', lastName: 'นิลประดับ', fullName: 'นางสาวสุวรรณี นิลประดับ' }];
  }
  if (!grade || grade === 'ทั้งหมด') {
    return state.teachers.map(t => ({
      ...t,
      fullName: `${t.prefix || ''}${t.firstName} ${t.lastName}`.trim()
    }));
  }
  const sG = formatShortGrade(grade);
  const filtered = state.teachers.filter(t => formatShortGrade(t.gradeLevel) === sG || t.gradeLevel === grade);
  if (filtered.length > 0) {
    return filtered.map(t => ({
      ...t,
      fullName: `${t.prefix || ''}${t.firstName} ${t.lastName}`.trim()
    }));
  }
  return [{ prefix: 'นางสาว', firstName: 'สุวรรณี', lastName: 'นิลประดับ', fullName: 'นางสาวสุวรรณี นิลประดับ' }];
}

function formatTeachersNames(teachers, separator = ' และ ') {
  if (!teachers) return '-';
  if (typeof teachers === 'string') return teachers;
  if (Array.isArray(teachers)) {
    if (teachers.length === 0) return '-';
    const names = teachers.map(t => {
      if (typeof t === 'string') return t;
      return t.fullName || `${t.prefix || ''}${t.firstName} ${t.lastName}`.trim();
    }).filter(Boolean);
    return names.join(separator);
  }
  return '-';
}

function buildOfficialSignaturesHtml(grade, directorName) {
  const teachers = getGradeTeachers(grade);
  const dirName = directorName || state.schoolInfo?.directorName || 'นายกฤษฎา ผลพล';
  const dirPos = state.schoolInfo?.directorPosition || 'ผู้อำนวยการโรงเรียนบ้านสันดาบ';
  
  if (teachers.length >= 2) {
    const pos0 = teachers[0]?.position || 'ครูประจำชั้น';
    const pos1 = teachers[1]?.position || 'ครูประจำชั้น';
    return `
      <div class="print-signatures-grid cols-3" style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 1.0rem; width: 100%; page-break-inside: avoid; break-inside: avoid;">
        <div class="sig-block" style="text-align: center; width: 31%;">
          <div style="white-space: nowrap; margin-bottom: 0.35rem; font-size: 0.84rem;">ลงชื่อ ...................................................... ผู้ประเมิน</div>
          <div style="font-weight: 700; white-space: nowrap; font-size: 0.86rem;">(${teachers[0].fullName})</div>
          <div style="font-size: 0.78rem; color: #444; margin-top: 2px;">ตำแหน่ง ${pos0}</div>
        </div>
        <div class="sig-block" style="text-align: center; width: 31%;">
          <div style="white-space: nowrap; margin-bottom: 0.35rem; font-size: 0.84rem;">ลงชื่อ ...................................................... ผู้ประเมิน</div>
          <div style="font-weight: 700; white-space: nowrap; font-size: 0.86rem;">(${teachers[1].fullName})</div>
          <div style="font-size: 0.78rem; color: #444; margin-top: 2px;">ตำแหน่ง ${pos1}</div>
        </div>
        <div class="sig-block" style="text-align: center; width: 31%;">
          <div style="white-space: nowrap; margin-bottom: 0.35rem; font-size: 0.84rem;">ลงชื่อ ...................................................... ผู้ตรวจสอบ/อนุมัติ</div>
          <div style="font-weight: 700; white-space: nowrap; font-size: 0.86rem;">(${dirName})</div>
          <div style="font-size: 0.78rem; color: #444; margin-top: 2px;">${dirPos}</div>
        </div>
      </div>
    `;
  }
  
  const teacherName = teachers[0]?.fullName || 'นางสาวสุวรรณี นิลประดับ';
  const pos = teachers[0]?.position || 'ครูประจำชั้น';
  return `
    <div class="print-signatures-grid" style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 1.0rem; width: 100%; max-width: 90%; margin-left: auto; margin-right: auto; page-break-inside: avoid; break-inside: avoid;">
      <div class="sig-block" style="text-align: center; width: 45%;">
        <div style="white-space: nowrap; margin-bottom: 0.35rem; font-size: 0.84rem;">ลงชื่อ ............................................................ ผู้ประเมิน</div>
        <div style="font-weight: 700; white-space: nowrap; font-size: 0.86rem;">(${teacherName})</div>
        <div style="font-size: 0.78rem; color: #444; margin-top: 2px;">ตำแหน่ง ${pos}</div>
      </div>
      <div class="sig-block" style="text-align: center; width: 45%;">
        <div style="white-space: nowrap; margin-bottom: 0.35rem; font-size: 0.84rem;">ลงชื่อ ............................................................ ผู้ตรวจสอบ/อนุมัติ</div>
        <div style="font-weight: 700; white-space: nowrap; font-size: 0.86rem;">(${dirName})</div>
        <div style="font-size: 0.78rem; color: #444; margin-top: 2px;">${dirPos}</div>
      </div>
    </div>
  `;
}


function renderHeaderInfo() {
  const s = state.schoolInfo || {};
  const currentGrade = s.gradeLevel || 'ประถมศึกษาปีที่ 1';
  const teachers = getGradeTeachers(currentGrade);
  const teacherNames = formatTeachersNames(teachers, ' และ ');

  const nameEl = document.getElementById('topbar-teacher-name');
  const roleEl = document.getElementById('topbar-teacher-role');
  const schoolEl = document.getElementById('header-school-name');
  const areaEl = document.getElementById('header-area-zone');
  const sigTeacher = document.getElementById('sig-teacher-name');
  const sigDirector = document.getElementById('sig-director-name');
  const dispDirName = document.getElementById('display-director-name');
  const dispDirPhone = document.getElementById('display-director-phone');
  const dispDirPos = document.getElementById('display-director-pos');
  const dispDirAvatar = document.getElementById('display-director-avatar');
  const topbarAvatar = document.getElementById('topbar-avatar');

  if (nameEl) nameEl.textContent = teacherNames;
  if (roleEl) roleEl.textContent = teachers.length > 1 ? 'คณะครูประจำชั้น' : 'ครูประจำชั้น';
  if (schoolEl) schoolEl.textContent = s.schoolName || 'โรงเรียนบ้านสันดาบ';
  if (areaEl) areaEl.textContent = s.areaZone || 'สังกัดสำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร';
  if (sigTeacher) sigTeacher.textContent = teacherNames;
  if (sigDirector) sigDirector.textContent = s.directorName || 'นายกฤษฎา ผลพล';
  if (dispDirName) dispDirName.textContent = s.directorName || 'นายกฤษฎา ผลพล';
  if (dispDirPhone) dispDirPhone.textContent = s.directorPhone || '081-194-1990';
  if (dispDirPos) dispDirPos.textContent = s.directorPosition || 'ผู้อำนวยการโรงเรียนบ้านสันดาบ';
  if (dispDirAvatar) {
    const avatarSrc = s.directorAvatar || 'images/school_logo.png';
    dispDirAvatar.src = avatarSrc;
    const isLogo = !s.directorAvatar || s.directorAvatar === 'images/school_logo.png' || s.directorAvatar.includes('school_logo');
    dispDirAvatar.style.objectFit = isLogo ? 'contain' : 'cover';
    dispDirAvatar.style.padding = isLogo ? '1px 2px' : '0';
  }
  if (topbarAvatar && teachers.length > 0 && teachers[0].avatar) {
    topbarAvatar.src = teachers[0].avatar;
  }
}

function setupGradeDropdown() {
  // Close grade dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('grade-dropdown-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
      wrapper.classList.remove('open');
    }
  });
}

function toggleGradeDropdown(event) {
  if (event) event.stopPropagation();
  const wrapper = document.getElementById('grade-dropdown-wrapper');
  if (wrapper) {
    wrapper.classList.toggle('open');
  }
}

function closeGradeDropdown() {
  const wrapper = document.getElementById('grade-dropdown-wrapper');
  if (wrapper) {
    wrapper.classList.remove('open');
  }
}

function selectGradeFromDropdown(gradeName) {
  if (!gradeName) return;
  state.schoolInfo.gradeLevel = gradeName;
  saveData(false);
  updateGradeDisplay();
  renderSchoolForm();
  renderStudentsTable();
  renderReadingTable();
  renderCharacteristicsTable();
  renderCompetenciesTable();
  renderReportTable();
  renderHeaderInfo();
  updateDashboardKpis();
  closeGradeDropdown();
  const cleanGrade = gradeName === 'ทั้งหมด' ? 'ทุกระดับชั้น' : (gradeName.startsWith('ชั้น') ? gradeName : `ชั้น${gradeName}`);
  showToast(`เปลี่ยนการแสดงผลเป็น ${cleanGrade} เรียบร้อยแล้ว`, 'success');
}

function quickSelectGrade(gradeName) {
  selectGradeFromDropdown(gradeName);
}

function openGradeModal() {
  const modal = document.getElementById('grade-modal');
  const s = state.schoolInfo || {};
  const grade = s.gradeLevel || 'ประถมศึกษาปีที่ 1';
  const room = s.room || '1';
  const year = s.academicYear || '2569';
  const semester = s.semester || '1';

  selectGradePill(grade);
  setVal('modal-grade-room', room);
  setVal('modal-grade-year', year);
  setVal('modal-grade-semester', semester);

  if (modal) modal.classList.add('open');
}

function closeGradeModal() {
  const modal = document.getElementById('grade-modal');
  if (modal) modal.classList.remove('open');
}

function selectGradePill(gradeName) {
  const hidden = document.getElementById('modal-selected-grade');
  if (hidden) hidden.value = gradeName;

  const pills = document.querySelectorAll('.grade-pill');
  pills.forEach(pill => {
    if (pill.getAttribute('data-grade') === gradeName) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });
}

function saveGradeModal() {
  const grade = getVal('modal-selected-grade') || 'ประถมศึกษาปีที่ 1';
  const room = getVal('modal-grade-room') || '1';
  const year = getVal('modal-grade-year') || '2569';
  const semester = getVal('modal-grade-semester') || '1';

  state.schoolInfo = {
    ...state.schoolInfo,
    gradeLevel: grade,
    room: room,
    academicYear: year,
    semester: semester
  };

  saveData(true);
  updateGradeDisplay();
  renderSchoolForm();
  renderStudentsTable();
  renderReadingTable();
  renderCharacteristicsTable();
  renderCompetenciesTable();
  renderReportTable();
  renderHeaderInfo();
  updateDashboardKpis();
  closeGradeModal();
  showToast(`เปลี่ยนระดับชั้นเป็น ${grade} ห้อง ${room} เรียบร้อยแล้ว`, 'success');
}

function updateGradeDisplay() {
  const s = state.schoolInfo || {};
  const grade = s.gradeLevel || 'ประถมศึกษาปีที่ 1';
  const room = s.room || '1';
  const year = s.academicYear || '2569';
  const semester = s.semester || '1';

  const shortMap = {
    'ประถมศึกษาปีที่ 1': 'ป.1',
    'ประถมศึกษาปีที่ 2': 'ป.2',
    'ประถมศึกษาปีที่ 3': 'ป.3',
    'ประถมศึกษาปีที่ 4': 'ป.4',
    'ประถมศึกษาปีที่ 5': 'ป.5',
    'ประถมศึกษาปีที่ 6': 'ป.6',
    'ทั้งหมด': 'ทุกชั้น'
  };
  const shortG = shortMap[grade] || formatShortGrade(grade);

  // Update Topbar Grade Trigger Text
  const triggerText = document.getElementById('grade-select-text');
  if (triggerText) {
    if (grade === 'ทั้งหมด') {
      triggerText.textContent = 'ทุกระดับชั้น (ป.1 - ป.6)';
    } else {
      const cleanGrade = grade.startsWith('ชั้น') ? grade : `ชั้น${grade}`;
      triggerText.textContent = `${cleanGrade} ห้อง ${room}`;
    }
  }

  const badge = document.getElementById('topbar-grade-badge');
  if (badge) {
    badge.textContent = grade === 'ทั้งหมด' ? 'ทุกชั้น' : `${shortG}/${room}`;
  }

  // Update dropdown active highlight
  document.querySelectorAll('.grade-option-item').forEach(item => {
    if (item.getAttribute('data-grade') === grade) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update all content grade select elements across all tabs
  document.querySelectorAll('.content-grade-select').forEach(sel => {
    sel.value = grade;
  });

  const studentGradeFilter = document.getElementById('student-grade-filter');
  if (studentGradeFilter) {
    studentGradeFilter.value = grade;
  }

  // Update all content semester select elements
  document.querySelectorAll('.content-semester-select').forEach(sel => {
    sel.value = semester;
  });

  // Update all content year inputs
  document.querySelectorAll('.content-year-input').forEach(inp => {
    inp.value = year;
  });

  // Update current-grade-tag on all tabs
  const isAll = grade === 'ทั้งหมด';
  const gradeLabel = isAll ? 'ทุกระดับชั้น (ป.1 - ป.6)' : (grade.startsWith('ชั้น') ? grade : `ชั้น${grade}`);
  const semesterText = semester === 'ตลอดปีการศึกษา' ? 'ตลอดปีการศึกษา' : `ภาคเรียนที่ ${semester}`;
  const fullInfoTag = `${gradeLabel} ${semesterText} ปีการศึกษา ${year}`;

  document.querySelectorAll('.current-grade-tag').forEach(tag => {
    tag.textContent = fullInfoTag;
  });

  // Update short grade tags (e.g. ป.1, ป.2, ทุกชั้น)
  document.querySelectorAll('.current-short-grade-tag').forEach(tag => {
    tag.textContent = shortG;
  });

  // Update School Form select elements
  const formSelect = document.getElementById('school-grade');
  if (formSelect) formSelect.value = grade;
  const formSem = document.getElementById('school-semester');
  if (formSem) formSem.value = semester;
  const formYear = document.getElementById('school-year');
  if (formYear) formYear.value = year;

  const reportGrade = document.getElementById('report-grade-room');
  const reportYear = document.getElementById('report-academic-year');
  const reportSemester = document.getElementById('report-semester');
  if (reportGrade) reportGrade.textContent = isAll ? gradeLabel : `${gradeLabel} ห้อง ${room}`;
  if (reportYear) reportYear.textContent = year;
  if (reportSemester) reportSemester.textContent = semesterText;
}

function onGradeFormChange() {
  const grade = getVal('school-grade');
  const room = getVal('school-room');
  state.schoolInfo.gradeLevel = grade;
  state.schoolInfo.room = room;
  updateGradeDisplay();
  renderStudentsTable();
  renderReadingTable();
  renderCharacteristicsTable();
  renderCompetenciesTable();
  renderReportTable();
  renderHeaderInfo();
  updateDashboardKpis();
}

function clearAllStudents() {
  if (state.students.length === 0) {
    showToast('ไม่มีข้อมูลนักเรียนในระบบ', 'info');
    return;
  }

  if (confirm(`คุณต้องการล้างข้อมูลนักเรียนทั้งหมด (${state.students.length} คน) ใช่หรือไม่?\n\n* ข้อมูลคะแนนแบบประเมินทั้งหมดจะถูกล้างออกจากระบบ *`)) {
    state.students = [];
    state.readingAssessments = {};
    state.characteristicsAssessments = {};
    state.competenciesAssessments = {};
    saveData(true);
    renderAll();
    showToast('ล้างข้อมูลนักเรียนทั้งหมดเรียบร้อยแล้ว', 'info');
  }
}

/* ==========================================================================
   5. Teacher Management (ข้อมูลครูประจำชั้น - เพิ่ม/แก้ไข/ลบ)
   ========================================================================== */
function renderTeacherCards() {
  const container = document.getElementById('teachers-cards-container');
  const countBadge = document.getElementById('teacher-count-badge');
  const dirNameEl = document.getElementById('display-director-name');
  const dirPhoneEl = document.getElementById('display-director-phone');

  const s = state.schoolInfo || {};
  const dirName = s.directorName || 'นายกฤษฎา ผลพล';
  const dirPhone = s.directorPhone || '081-194-1990';

  if (dirNameEl) dirNameEl.textContent = dirName;
  if (dirPhoneEl) dirPhoneEl.textContent = dirPhone;

  if (!container) return;

  if (countBadge) countBadge.textContent = state.teachers.length;

  const defaultAvatarSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2394a3b8'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";

  let html = state.teachers.map((t, idx) => {
    const phoneDisplay = (t.phone && t.phone.trim() && t.phone !== '-') 
      ? `<div><i class="fa-solid fa-phone" style="width: 18px; color: var(--primary-blue);"></i> เบอร์โทร: <a href="tel:${t.phone.replace(/[^0-9]/g, '')}" style="color: var(--primary-blue); text-decoration: none; font-weight: 600;">${t.phone}</a></div>` 
      : '';
    const emailDisplay = (t.email && t.email.trim() && t.email !== '-') 
      ? `<div><i class="fa-solid fa-envelope" style="width: 18px; color: var(--primary-blue);"></i> อีเมล: ${t.email}</div>` 
      : '';
    const gradeBadge = t.gradeLevel ? `<span class="teacher-card-grade-badge">${t.gradeLevel}</span>` : '';
    const posTitle = t.position || 'ครูประจำชั้น';
    const rankPart = (t.academicRank && t.academicRank.trim() && t.academicRank !== '-' && t.academicRank !== 'ไม่มีวิทยฐานะ') 
      ? (t.academicRank.startsWith('ครู') ? ` | ${t.academicRank}` : ` | ครู${t.academicRank}`) 
      : '';

    const avatarHtml = t.avatar 
      ? `<img src="${t.avatar}" alt="${t.firstName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
      : `<i class="fa-solid fa-chalkboard-user"></i>`;

    return `
    <div class="teacher-card">
      <div>
        <div class="teacher-card-head">
          <div class="teacher-card-avatar">
            ${avatarHtml}
          </div>
          <div>
            <div style="display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.25rem;">
              <span class="teacher-card-role-badge">${t.role || `ครูประจำชั้นคนที่ ${idx + 1}`}</span>
              ${gradeBadge}
            </div>
            <div class="teacher-card-name">${t.prefix || ''}${t.firstName} ${t.lastName}</div>
            <div class="teacher-card-pos">${posTitle}${rankPart}</div>
          </div>
        </div>
        <div class="teacher-card-info-list" style="margin-top: 0.75rem;">
          ${phoneDisplay}
          ${emailDisplay}
        </div>
      </div>
      <div class="teacher-card-actions">
        <button class="btn btn-outline btn-sm" onclick="editTeacher(${t.id})" title="แก้ไข">
          <i class="fa-solid fa-pen"></i> แก้ไข
        </button>
        ${state.teachers.length > 1 ? `
        <button class="btn btn-outline btn-sm" onclick="deleteTeacher(${t.id})" title="ลบ" style="color: #ef4444; border-color: #fee2e2;">
          <i class="fa-solid fa-trash"></i> ลบ
        </button>` : ''}
      </div>
    </div>
    `;
  }).join('');

  html += `
    <div class="teacher-add-card" onclick="openTeacherModal()">
      <div class="teacher-add-icon">
        <i class="fa-solid fa-plus"></i>
      </div>
      <div style="font-family: var(--font-heading); font-weight: 700; font-size: 1rem;">เพิ่มครูประจำชั้น</div>
      <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">เพิ่มข้อมูลครูประจำชั้นในระบบ</div>
    </div>
  `;

  container.innerHTML = html;
}

function handleTeacherPhotoUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, GIF, WebP)');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = async function() {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const maxDim = 500;

      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      
      const preview = document.getElementById('modal-teacher-avatar-preview');
      const valInput = document.getElementById('modal-teacher-avatar-val');
      if (preview) {
        preview.src = dataUrl;
        preview.style.objectFit = 'cover';
        preview.style.padding = '0';
      }
      if (valInput) valInput.value = dataUrl;

      // If Google Cloud API is connected, upload to Google Drive Folder 1Bsru56qKchSlP0imhGnkwIAWu2S4ymvT
      if (window.cloudApi && window.cloudApi.isConfigured()) {
        try {
          showToast('กำลังอัปโหลดรูปครูไปยัง Google Drive...', 'info');
          const teacherName = (document.getElementById('modal-teacher-firstname')?.value || 'teacher') + '_' + (document.getElementById('modal-teacher-lastname')?.value || '');
          const res = await window.cloudApi.uploadFile(dataUrl, `teacher_${teacherName}_${Date.now()}.jpg`, 'image/jpeg', 'teacher', document.getElementById('modal-teacher-id')?.value || '', teacherName);
          if (res && res.directUrl) {
            if (valInput) valInput.value = res.directUrl;
            showToast('อัปโหลดรูปภาพขึ้น Google Drive สำเร็จ', 'success');
          }
        } catch (uploadErr) {
          console.warn('Drive upload failed, using local image:', uploadErr);
        }
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeTeacherPhoto() {
  const preview = document.getElementById('modal-teacher-avatar-preview');
  const valInput = document.getElementById('modal-teacher-avatar-val');
  const fileInput = document.getElementById('modal-teacher-photo-file');
  
  const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2394a3b8'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
  
  if (preview) {
    preview.src = defaultAvatar;
    preview.style.objectFit = 'contain';
    preview.style.padding = '6px';
  }
  if (valInput) valInput.value = '';
  if (fileInput) fileInput.value = '';
}

function openTeacherModal(teacher = null) {
  const modal = document.getElementById('teacher-modal');
  const title = document.getElementById('teacher-modal-title');
  const idInput = document.getElementById('modal-teacher-id');
  const avatarValInput = document.getElementById('modal-teacher-avatar-val');
  const avatarPreview = document.getElementById('modal-teacher-avatar-preview');
  const fileInput = document.getElementById('modal-teacher-photo-file');
  const gradeInput = document.getElementById('modal-teacher-grade');
  const roleInput = document.getElementById('modal-teacher-role');
  const prefixInput = document.getElementById('modal-teacher-prefix');
  const fnInput = document.getElementById('modal-teacher-firstname');
  const lnInput = document.getElementById('modal-teacher-lastname');
  const posInput = document.getElementById('modal-teacher-position');
  const rankInput = document.getElementById('modal-teacher-rank');
  const phoneInput = document.getElementById('modal-teacher-phone');
  const emailInput = document.getElementById('modal-teacher-email');

  if (fileInput) fileInput.value = '';

  const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2394a3b8'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";

  if (teacher) {
    title.innerHTML = '<i class="fa-solid fa-pen text-primary"></i> แก้ไขข้อมูลครูประจำชั้น';
    idInput.value = teacher.id;
    if (avatarValInput) avatarValInput.value = teacher.avatar || '';
    if (avatarPreview) {
      avatarPreview.src = teacher.avatar || defaultAvatar;
      avatarPreview.style.objectFit = teacher.avatar ? 'cover' : 'contain';
      avatarPreview.style.padding = teacher.avatar ? '0' : '6px';
    }

    if (gradeInput) gradeInput.value = teacher.gradeLevel || 'ประถมศึกษาปีที่ 1';
    
    if (roleInput) {
      const targetRole = teacher.role || 'ครูประจำชั้นคนที่ 1';
      let found = false;
      for (let i = 0; i < roleInput.options.length; i++) {
        if (roleInput.options[i].value === targetRole) {
          roleInput.selectedIndex = i;
          found = true;
          break;
        }
      }
      if (!found) {
        const opt = document.createElement('option');
        opt.value = targetRole;
        opt.textContent = targetRole;
        roleInput.appendChild(opt);
        roleInput.value = targetRole;
      }
    }
    
    if (prefixInput) {
      const targetPrefix = teacher.prefix || 'นางสาว';
      let found = false;
      for (let i = 0; i < prefixInput.options.length; i++) {
        if (prefixInput.options[i].value === targetPrefix) {
          prefixInput.selectedIndex = i;
          found = true;
          break;
        }
      }
      if (!found) {
        const opt = document.createElement('option');
        opt.value = targetPrefix;
        opt.textContent = targetPrefix;
        prefixInput.appendChild(opt);
        prefixInput.value = targetPrefix;
      }
    }

    if (fnInput) fnInput.value = teacher.firstName || '';
    if (lnInput) lnInput.value = teacher.lastName || '';
    if (posInput) posInput.value = teacher.position || 'ครูประจำชั้น';
    
    if (rankInput) {
      const targetRank = teacher.academicRank || '';
      let found = false;
      for (let i = 0; i < rankInput.options.length; i++) {
        if (rankInput.options[i].value === targetRank) {
          rankInput.selectedIndex = i;
          found = true;
          break;
        }
      }
      if (!found && targetRank) {
        const opt = document.createElement('option');
        opt.value = targetRank;
        opt.textContent = targetRank;
        rankInput.appendChild(opt);
        rankInput.value = targetRank;
      } else if (!found) {
        rankInput.value = '';
      }
    }

    if (phoneInput) phoneInput.value = teacher.phone && teacher.phone !== '-' ? teacher.phone : '';
    if (emailInput) emailInput.value = teacher.email && teacher.email !== '-' ? teacher.email : '';
  } else {
    title.innerHTML = '<i class="fa-solid fa-user-plus text-primary"></i> เพิ่มครูประจำชั้นใหม่';
    idInput.value = '';
    if (avatarValInput) avatarValInput.value = '';
    if (avatarPreview) {
      avatarPreview.src = defaultAvatar;
      avatarPreview.style.objectFit = 'contain';
      avatarPreview.style.padding = '6px';
    }

    if (gradeInput) gradeInput.value = state.schoolInfo.gradeLevel || 'ประถมศึกษาปีที่ 1';
    if (roleInput) roleInput.value = 'ครูประจำชั้นคนที่ 1';
    if (prefixInput) prefixInput.value = 'นางสาว';
    if (fnInput) fnInput.value = '';
    if (lnInput) lnInput.value = '';
    if (posInput) posInput.value = 'ครูประจำชั้น';
    if (rankInput) rankInput.value = 'ชำนาญการพิเศษ';
    if (phoneInput) phoneInput.value = '';
    if (emailInput) emailInput.value = '';
  }

  modal.classList.add('open');
}

function closeTeacherModal() {
  const modal = document.getElementById('teacher-modal');
  if (modal) modal.classList.remove('open');
}

function saveTeacherModal(event) {
  event.preventDefault();
  const id = document.getElementById('modal-teacher-id').value;
  const avatar = document.getElementById('modal-teacher-avatar-val') ? document.getElementById('modal-teacher-avatar-val').value : '';
  const gradeLevel = document.getElementById('modal-teacher-grade') ? document.getElementById('modal-teacher-grade').value : 'ประถมศึกษาปีที่ 1';
  const role = document.getElementById('modal-teacher-role').value;
  const prefix = document.getElementById('modal-teacher-prefix').value;
  const firstName = document.getElementById('modal-teacher-firstname').value.trim();
  const lastName = document.getElementById('modal-teacher-lastname').value.trim();
  const position = document.getElementById('modal-teacher-position').value.trim() || 'ครูประจำชั้น';
  const academicRank = document.getElementById('modal-teacher-rank').value;
  const phone = document.getElementById('modal-teacher-phone').value.trim() || '-';
  const email = document.getElementById('modal-teacher-email') ? document.getElementById('modal-teacher-email').value.trim() : '';

  if (!firstName || !lastName) {
    alert('กรุณากรอกชื่อและนามสกุล');
    return;
  }

  if (id) {
    const idx = state.teachers.findIndex(t => t.id === Number(id));
    if (idx !== -1) {
      state.teachers[idx] = {
        ...state.teachers[idx],
        avatar: avatar || state.teachers[idx].avatar || '',
        gradeLevel,
        role,
        prefix,
        firstName,
        lastName,
        position,
        academicRank,
        phone,
        email
      };
      showToast('แก้ไขข้อมูลครูเรียบร้อยแล้ว', 'success');
    }
  } else {
    const newId = state.teachers.length > 0 ? Math.max(...state.teachers.map(t => t.id)) + 1 : 1;
    state.teachers.push({
      id: newId,
      avatar,
      gradeLevel,
      role,
      prefix,
      firstName,
      lastName,
      position,
      academicRank,
      phone,
      email
    });
    showToast('เพิ่มครูประจำชั้นเรียบร้อยแล้ว', 'success');
  }

  closeTeacherModal();
  saveData(false);
  renderTeacherCards();
  renderHeaderInfo();
  renderReportTable();
}

function editTeacher(id) {
  const t = state.teachers.find(item => item.id === id);
  if (t) openTeacherModal(t);
}

function deleteTeacher(id) {
  if (state.teachers.length <= 1) {
    alert('ต้องมีครูประจำชั้นอย่างน้อย 1 ท่านในระบบ');
    return;
  }
  const t = state.teachers.find(item => item.id === id);
  if (!t) return;

  if (confirm(`คุณต้องการลบ "${t.prefix}${t.firstName} ${t.lastName}" ออกจากรายชื่อครูใช่หรือไม่?`)) {
    state.teachers = state.teachers.filter(item => item.id !== id);
    saveData(false);
    renderTeacherCards();
    renderHeaderInfo();
    renderReportTable();
    showToast('ลบข้อมูลครูเรียบร้อยแล้ว', 'info');
  }
}

function renderSchoolForm() {
  const s = state.schoolInfo || {};
  setVal('school-name', s.schoolName || 'โรงเรียนบ้านสันดาบ');
  setVal('school-area', s.areaZone || 'สังกัดสำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร');
  setVal('school-grade', s.gradeLevel || 'ประถมศึกษาปีที่ 1');
  setVal('school-room', s.room || '1');
  setVal('school-year', s.academicYear || '2569');
  setVal('school-semester', s.semester || '1');
  setVal('school-director', s.directorName || 'นายกฤษฎา ผลพล');
  setVal('director-name', s.directorName || 'นายกฤษฎา ผลพล');
  setVal('director-phone', s.directorPhone || '081-194-1990');
}

function setupSchoolForm() {
  const btnSave = document.getElementById('btn-save-school');
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      const dirName = getVal('school-director') || getVal('director-name') || 'นายกฤษฎา ผลพล';
      const dirPhone = getVal('director-phone') || '081-194-1990';
      const schName = getVal('school-name') || 'โรงเรียนบ้านสันดาบ';
      const area = getVal('school-area') || 'สังกัดสำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร';

      state.schoolInfo = {
        ...state.schoolInfo,
        schoolName: schName,
        areaZone: area,
        gradeLevel: getVal('school-grade') || state.schoolInfo.gradeLevel || 'ประถมศึกษาปีที่ 1',
        room: getVal('school-room') || state.schoolInfo.room || '1',
        academicYear: getVal('school-year') || state.schoolInfo.academicYear || '2569',
        semester: getVal('school-semester') || state.schoolInfo.semester || '1',
        directorName: dirName,
        directorPhone: dirPhone
      };
      saveData(true);
      renderHeaderInfo();
      renderTeacherCards();
      updateGradeDisplay();
      renderReportTable();
      showToast('บันทึกข้อมูลโรงเรียนและผู้บริหารเรียบร้อยแล้ว', 'success');
    });
  }
}

/* ==========================================================================
   5.1 Director Management Modal (แก้ไขข้อมูลผู้บริหารสถานศึกษาและโรงเรียน)
   ========================================================================== */
function openDirectorModal() {
  const modal = document.getElementById('director-modal');
  if (!modal) return;

  const s = state.schoolInfo || {};
  let fullName = (s.directorName || 'นายกฤษฎา ผลพล').trim();
  let prefix = 'นาย';
  let firstName = '';
  let lastName = '';

  const knownPrefixes = ['ว่าที่ ร.ต.', 'ว่าที่ร้อยตรี', 'ดร.', 'นางสาว', 'นาง', 'นาย', 'อาจารย์', 'ผศ.', 'รศ.'];
  for (const p of knownPrefixes) {
    if (fullName.startsWith(p)) {
      prefix = p;
      fullName = fullName.substring(p.length).trim();
      break;
    }
  }

  const nameParts = fullName.split(/\s+/);
  firstName = nameParts[0] || '';
  lastName = nameParts.slice(1).join(' ') || '';

  const prefixInput = document.getElementById('modal-director-prefix');
  const fnInput = document.getElementById('modal-director-firstname');
  const lnInput = document.getElementById('modal-director-lastname');
  const posInput = document.getElementById('modal-director-position');
  const phoneInput = document.getElementById('modal-director-phone');
  const schoolInput = document.getElementById('modal-director-school');
  const areaInput = document.getElementById('modal-director-area');
  const avatarVal = document.getElementById('modal-director-avatar-val');
  const avatarPrev = document.getElementById('modal-director-avatar-preview');
  const fileInput = document.getElementById('modal-director-photo-file');

  if (fileInput) fileInput.value = '';

  if (prefixInput) {
    let found = false;
    for (let i = 0; i < prefixInput.options.length; i++) {
      if (prefixInput.options[i].value === prefix) {
        prefixInput.selectedIndex = i;
        found = true;
        break;
      }
    }
    if (!found) {
      const opt = document.createElement('option');
      opt.value = prefix;
      opt.textContent = prefix;
      prefixInput.appendChild(opt);
      prefixInput.value = prefix;
    }
  }

  if (fnInput) fnInput.value = firstName;
  if (lnInput) lnInput.value = lastName;
  if (posInput) posInput.value = s.directorPosition || 'ผู้อำนวยการโรงเรียนบ้านสันดาบ';
  if (phoneInput) phoneInput.value = s.directorPhone || '081-194-1990';
  if (schoolInput) schoolInput.value = s.schoolName || 'โรงเรียนบ้านสันดาบ';
  if (areaInput) areaInput.value = s.areaZone || 'สังกัดสำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร';

  const avatarSrc = s.directorAvatar || 'images/school_logo.png';
  if (avatarVal) avatarVal.value = s.directorAvatar || '';
  if (avatarPrev) {
    avatarPrev.src = avatarSrc;
    const isLogo = !s.directorAvatar || s.directorAvatar === 'images/school_logo.png' || s.directorAvatar.includes('school_logo');
    avatarPrev.style.objectFit = isLogo ? 'contain' : 'cover';
    avatarPrev.style.padding = isLogo ? '2px' : '0';
  }

  modal.classList.add('open');
}

function closeDirectorModal() {
  const modal = document.getElementById('director-modal');
  if (modal) modal.classList.remove('open');
}

function handleDirectorPhotoUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, GIF, WebP)');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = async function() {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const maxDim = 500;

      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      
      const preview = document.getElementById('modal-director-avatar-preview');
      const valInput = document.getElementById('modal-director-avatar-val');
      if (preview) {
        preview.src = dataUrl;
        preview.style.objectFit = 'cover';
        preview.style.padding = '0';
      }
      if (valInput) valInput.value = dataUrl;

      // If Google Cloud API is connected, upload to Google Drive Folder 1Bsru56qKchSlP0imhGnkwIAWu2S4ymvT
      if (window.cloudApi && window.cloudApi.isConfigured()) {
        try {
          showToast('กำลังอัปโหลดรูปผู้บริหารไปยัง Google Drive...', 'info');
          const dirName = (document.getElementById('modal-director-firstname')?.value || 'director') + '_' + (document.getElementById('modal-director-lastname')?.value || '');
          const res = await window.cloudApi.uploadFile(dataUrl, `director_${dirName}_${Date.now()}.jpg`, 'image/jpeg', 'director', 'director', dirName);
          if (res && res.directUrl) {
            if (valInput) valInput.value = res.directUrl;
            showToast('อัปโหลดรูปภาพขึ้น Google Drive สำเร็จ', 'success');
          }
        } catch (uploadErr) {
          console.warn('Drive upload failed, using local image:', uploadErr);
        }
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function resetDirectorPhoto() {
  const preview = document.getElementById('modal-director-avatar-preview');
  const valInput = document.getElementById('modal-director-avatar-val');
  const fileInput = document.getElementById('modal-director-photo-file');
  
  if (preview) {
    preview.src = 'images/school_logo.png';
    preview.style.objectFit = 'contain';
    preview.style.padding = '2px';
  }
  if (valInput) valInput.value = '';
  if (fileInput) fileInput.value = '';
}

function saveDirectorModal(event) {
  event.preventDefault();
  const prefix = document.getElementById('modal-director-prefix') ? document.getElementById('modal-director-prefix').value : 'นาย';
  const firstName = document.getElementById('modal-director-firstname') ? document.getElementById('modal-director-firstname').value.trim() : '';
  const lastName = document.getElementById('modal-director-lastname') ? document.getElementById('modal-director-lastname').value.trim() : '';
  const position = document.getElementById('modal-director-position') ? document.getElementById('modal-director-position').value.trim() : 'ผู้อำนวยการโรงเรียนบ้านสันดาบ';
  const phone = document.getElementById('modal-director-phone') ? document.getElementById('modal-director-phone').value.trim() : '081-194-1990';
  const schoolName = document.getElementById('modal-director-school') ? document.getElementById('modal-director-school').value.trim() : 'โรงเรียนบ้านสันดาบ';
  const areaZone = document.getElementById('modal-director-area') ? document.getElementById('modal-director-area').value.trim() : 'สังกัดสำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร';
  const avatar = document.getElementById('modal-director-avatar-val') ? document.getElementById('modal-director-avatar-val').value : '';

  if (!firstName || !lastName) {
    alert('กรุณากรอกชื่อและนามสกุลผู้บริหาร');
    return;
  }

  const fullDirectorName = `${prefix}${firstName} ${lastName}`.trim();

  state.schoolInfo = {
    ...state.schoolInfo,
    directorName: fullDirectorName,
    directorPhone: phone,
    directorPosition: position || 'ผู้อำนวยการโรงเรียนบ้านสันดาบ',
    directorAvatar: avatar || '',
    schoolName: schoolName || 'โรงเรียนบ้านสันดาบ',
    areaZone: areaZone || 'สังกัดสำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร'
  };

  closeDirectorModal();
  saveData(true);
  renderHeaderInfo();
  renderSchoolForm();
  renderReportTable();
  updateGradeDisplay();
}

function getQualitativeLabel(score) {
  const num = Number(score);
  if (num === 3) return 'ดีเยี่ยม';
  if (num === 2) return 'ดี';
  if (num === 1) return 'ผ่าน';
  return 'ไม่ผ่าน';
}

function formatShortGrade(grade) {
  if (!grade) return 'ป.1';
  const gStr = String(grade).trim();
  if (gStr === 'ทั้งหมด' || gStr.toLowerCase() === 'all' || gStr.includes('ทุก')) return 'ทุกชั้น';

  if (gStr.includes('ป.1') || gStr.includes('ปีที่ 1') || gStr === '1' || gStr.startsWith('ป1')) return 'ป.1';
  if (gStr.includes('ป.2') || gStr.includes('ปีที่ 2') || gStr === '2' || gStr.startsWith('ป2')) return 'ป.2';
  if (gStr.includes('ป.3') || gStr.includes('ปีที่ 3') || gStr === '3' || gStr.startsWith('ป3')) return 'ป.3';
  if (gStr.includes('ป.4') || gStr.includes('ปีที่ 4') || gStr === '4' || gStr.startsWith('ป4')) return 'ป.4';
  if (gStr.includes('ป.5') || gStr.includes('ปีที่ 5') || gStr === '5' || gStr.startsWith('ป5')) return 'ป.5';
  if (gStr.includes('ป.6') || gStr.includes('ปีที่ 6') || gStr === '6' || gStr.startsWith('ป6')) return 'ป.6';

  const match = gStr.match(/[ปประถม]{1,10}\.?\s*([1-6])/);
  if (match) return `ป.${match[1]}`;

  return gStr;
}

function normalizeGradeFull(grade) {
  const shortG = formatShortGrade(grade);
  const map = {
    'ป.1': 'ประถมศึกษาปีที่ 1',
    'ป.2': 'ประถมศึกษาปีที่ 2',
    'ป.3': 'ประถมศึกษาปีที่ 3',
    'ป.4': 'ประถมศึกษาปีที่ 4',
    'ป.5': 'ประถมศึกษาปีที่ 5',
    'ป.6': 'ประถมศึกษาปีที่ 6',
    'ทุกชั้น': 'ทั้งหมด'
  };
  return map[shortG] || grade;
}

function isStudentInGrade(st, targetGrade) {
  if (!targetGrade || targetGrade === 'ทั้งหมด' || targetGrade === 'all' || targetGrade === 'ทุกชั้น') return true;
  const sG = formatShortGrade(st.gradeLevel || 'ประถมศึกษาปีที่ 1');
  const tG = formatShortGrade(targetGrade);
  return sG === tG;
}

function getStudentsForActiveGrade() {
  const activeGrade = state.schoolInfo.gradeLevel || 'ประถมศึกษาปีที่ 1';
  if (activeGrade === 'ทั้งหมด' || activeGrade === 'all' || activeGrade === 'ทุกชั้น') return state.students;
  return state.students.filter(st => isStudentInGrade(st, activeGrade));
}

function renderStudentsTable(query = '') {
  const tbody = document.getElementById('students-table-body');
  const countBadge = document.getElementById('students-count-badge');
  const countHeader = document.getElementById('students-count-header');
  const currentGrade = state.schoolInfo.gradeLevel || 'ประถมศึกษาปีที่ 1';
  if (!tbody) return;

  const gradeStudents = getStudentsForActiveGrade();
  if (countHeader) countHeader.textContent = gradeStudents.length;

  const searchVal = (typeof query === 'string' ? query : (document.getElementById('student-search-input')?.value || '')).toLowerCase().trim();

  const filtered = gradeStudents.filter(st => {
    if (!searchVal) return true;
    const name = `${st.prefix || ''}${st.firstName || ''} ${st.lastName || ''}`.toLowerCase();
    const code = (st.studentCode || '').toLowerCase();
    const grade = (st.gradeLevel || '').toLowerCase();
    return name.includes(searchVal) || code.includes(searchVal) || grade.includes(searchVal);
  });

  if (countBadge) {
    countBadge.textContent = filtered.length;
  }

  if (filtered.length === 0) {
    const isAll = currentGrade === 'ทั้งหมด';
    const gradeLabel = isAll ? 'ทุกระดับชั้น' : (currentGrade.startsWith('ชั้น') ? currentGrade : `ชั้น${currentGrade}`);
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
          <div style="font-size: 2rem; margin-bottom: 0.5rem; color: #cbd5e1;"><i class="fa-solid fa-user-slash"></i></div>
          <div style="font-weight: 600; font-size: 1rem; color: var(--text-dark); margin-bottom: 0.25rem;">
            ${searchVal ? `ไม่พบข้อมูลนักเรียนที่ค้นหา "${searchVal}"` : `ไม่พบข้อมูลนักเรียนใน ${gradeLabel}`}
          </div>
          <div style="font-size: 0.85rem; margin-bottom: 1rem;">
            ${searchVal ? 'ลองค้นหาด้วยคำอื่น หรือล้างช่องค้นหา' : `ท่านสามารถกดเพิ่มนักเรียนหรือนำเข้าไฟล์ข้อมูลนักเรียนสำหรับ ${gradeLabel} ได้ทันที`}
          </div>
          <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
            <button class="btn btn-primary btn-sm" onclick="openStudentModal()">
              <i class="fa-solid fa-user-plus"></i> เพิ่มนักเรียน ${isAll ? '' : 'ใน ' + gradeLabel}
            </button>
            <button class="btn btn-outline btn-sm" onclick="openImportModal()">
              <i class="fa-solid fa-file-excel"></i> นำเข้าไฟล์ (Excel/CSV)
            </button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((st, idx) => {
    const stNum = (st.studentNumber && String(st.studentNumber).trim() !== '' && String(st.studentNumber).trim() !== '-') ? st.studentNumber : (idx + 1);
    const shortGrade = formatShortGrade(st.gradeLevel || state.schoolInfo.gradeLevel || 'ป.1');
    const gender = st.gender || ((st.prefix === 'เด็กชาย' || st.prefix === 'นาย') ? 'ชาย' : 'หญิง');
    const status = st.status || 'กำลังศึกษา';

    return `
      <tr>
        <td style="text-align: center; font-weight: 600; color: var(--text-muted);">${stNum}</td>
        <td style="text-align: center;">
          <span class="badge-score" style="background: #e0f2fe; color: #0284c7; font-weight: 700; font-size: 0.8rem; padding: 0.2rem 0.55rem; border: 1px solid #bae6fd; border-radius: 6px;">
            ${shortGrade}
          </span>
        </td>
        <td style="text-align: center;"><span style="font-family: monospace; font-weight: 600; color: var(--primary-blue); font-size: 0.9rem;">${st.studentCode || '-'}</span></td>
        <td style="text-align: center; color: var(--text-dark);">${st.prefix || ''}</td>
        <td style="font-weight: 600; color: var(--text-dark);">${st.firstName || ''}</td>
        <td style="font-weight: 600; color: var(--text-dark);">${st.lastName || ''}</td>
        <td style="text-align: center;">
          <span class="badge-score" style="background: ${gender === 'ชาย' ? '#eff6ff' : '#fdf2f8'}; color: ${gender === 'ชาย' ? '#2563eb' : '#db2777'}; border: 1px solid ${gender === 'ชาย' ? '#dbeafe' : '#fce7f3'}; font-size: 0.8rem; padding: 0.2rem 0.5rem; border-radius: 6px;">
            ${gender}
          </span>
        </td>
        <td style="text-align: center;">
          <span class="badge-score score-3" style="font-size: 0.78rem; padding: 0.2rem 0.55rem; border-radius: 6px;">${status}</span>
        </td>
        <td style="text-align: center;">
          <div style="display: flex; gap: 0.35rem; justify-content: center; align-items: center;">
            <button class="btn btn-outline btn-sm" onclick="editStudent(${st.id})" title="แก้ไขข้อมูลนักเรียน" style="padding: 0.25rem 0.55rem; font-size: 0.8rem;">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-outline btn-sm" onclick="deleteStudent(${st.id})" title="ลบข้อมูลนักเรียน" style="padding: 0.25rem 0.55rem; font-size: 0.8rem; color: #ef4444; border-color: #fecaca; background: #fff5f5;">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function setupStudentSearch() {
  const searchInput = document.getElementById('student-search-input') || document.getElementById('search-student');
  const gradeFilter = document.getElementById('student-grade-filter');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderStudentsTable(e.target.value);
    });
  }

  if (gradeFilter) {
    gradeFilter.addEventListener('change', (e) => {
      selectGradeFromDropdown(e.target.value);
    });
  }
}

function openStudentModal(student = null) {
  const modal = document.getElementById('student-modal');
  const title = document.getElementById('student-modal-title');
  const idInput = document.getElementById('modal-student-id');
  const numberInput = document.getElementById('modal-student-number');
  const gradeInput = document.getElementById('modal-student-grade');
  const codeInput = document.getElementById('modal-student-code');
  const prefixInput = document.getElementById('modal-student-prefix');
  const fnInput = document.getElementById('modal-student-firstname');
  const lnInput = document.getElementById('modal-student-lastname');
  const statusInput = document.getElementById('modal-student-status');
  const avatarPreview = document.getElementById('modal-student-avatar-preview');
  const avatarVal = document.getElementById('modal-student-avatar-val');
  const photoFile = document.getElementById('modal-student-photo-file');

  if (photoFile) photoFile.value = '';

  if (student) {
    title.innerHTML = '<i class="fa-solid fa-pen text-primary" style="color: var(--primary-blue);"></i> แก้ไขข้อมูลนักเรียน';
    idInput.value = student.id;
    if (numberInput) numberInput.value = student.studentNumber || '';
    if (gradeInput) gradeInput.value = student.gradeLevel || state.schoolInfo.gradeLevel || 'ประถมศึกษาปีที่ 1';
    codeInput.value = student.studentCode || '';
    prefixInput.value = student.prefix || 'เด็กชาย';
    fnInput.value = student.firstName || '';
    lnInput.value = student.lastName || '';
    statusInput.value = student.status || 'กำลังศึกษา';
    if (avatarPreview) {
      avatarPreview.src = student.avatar || 'images/school_logo.png';
      avatarPreview.style.objectFit = student.avatar ? 'cover' : 'contain';
    }
    if (avatarVal) avatarVal.value = student.avatar || '';
  } else {
    title.innerHTML = '<i class="fa-solid fa-user-plus text-primary" style="color: var(--primary-blue);"></i> เพิ่มข้อมูลนักเรียน';
    idInput.value = '';
    const activeGradeStudents = getStudentsForActiveGrade();
    if (numberInput) numberInput.value = activeGradeStudents.length + 1;
    if (gradeInput) gradeInput.value = state.schoolInfo.gradeLevel || 'ประถมศึกษาปีที่ 1';
    codeInput.value = `690${String(state.students.length + 1).padStart(2, '0')}`;
    prefixInput.value = 'เด็กชาย';
    fnInput.value = '';
    lnInput.value = '';
    statusInput.value = 'กำลังศึกษา';
    if (avatarPreview) {
      avatarPreview.src = 'images/school_logo.png';
      avatarPreview.style.objectFit = 'contain';
    }
    if (avatarVal) avatarVal.value = '';
  }

  modal.classList.add('open');
}

function closeStudentModal() {
  const modal = document.getElementById('student-modal');
  if (modal) modal.classList.remove('open');
}

function handleStudentPhotoUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, GIF, WebP)');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = async function() {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const maxDim = 500;

      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      
      const preview = document.getElementById('modal-student-avatar-preview');
      const valInput = document.getElementById('modal-student-avatar-val');
      if (preview) {
        preview.src = dataUrl;
        preview.style.objectFit = 'cover';
      }
      if (valInput) valInput.value = dataUrl;

      // If Google Cloud API is connected, upload to Google Drive Folder 1Bsru56qKchSlP0imhGnkwIAWu2S4ymvT
      if (window.cloudApi && window.cloudApi.isConfigured()) {
        try {
          showToast('กำลังอัปโหลดรูปนักเรียนไปยัง Google Drive...', 'info');
          const code = document.getElementById('modal-student-code')?.value || 'student';
          const stName = (document.getElementById('modal-student-firstname')?.value || '') + '_' + (document.getElementById('modal-student-lastname')?.value || '');
          const res = await window.cloudApi.uploadFile(dataUrl, `student_${code}_${Date.now()}.jpg`, 'image/jpeg', 'student', code, stName);
          if (res && res.directUrl) {
            if (valInput) valInput.value = res.directUrl;
            showToast('อัปโหลดรูปภาพขึ้น Google Drive สำเร็จ', 'success');
          }
        } catch (uploadErr) {
          console.warn('Drive upload failed, using local image:', uploadErr);
        }
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeStudentPhoto() {
  const preview = document.getElementById('modal-student-avatar-preview');
  const valInput = document.getElementById('modal-student-avatar-val');
  const fileInput = document.getElementById('modal-student-photo-file');
  
  if (preview) {
    preview.src = 'images/school_logo.png';
    preview.style.objectFit = 'contain';
  }
  if (valInput) valInput.value = '';
  if (fileInput) fileInput.value = '';
}

function saveStudentModal(event) {
  event.preventDefault();
  const id = document.getElementById('modal-student-id').value;
  const avatar = document.getElementById('modal-student-avatar-val')?.value || '';
  const studentNumber = document.getElementById('modal-student-number') ? document.getElementById('modal-student-number').value.trim() : '';
  const gradeLevel = document.getElementById('modal-student-grade') ? document.getElementById('modal-student-grade').value : (state.schoolInfo.gradeLevel || 'ประถมศึกษาปีที่ 1');
  const prefix = document.getElementById('modal-student-prefix').value;
  const firstName = document.getElementById('modal-student-firstname').value.trim();
  const lastName = document.getElementById('modal-student-lastname').value.trim();
  const studentCode = document.getElementById('modal-student-code').value.trim();
  const status = document.getElementById('modal-student-status').value;
  const gender = (prefix === 'เด็กชาย' || prefix === 'นาย') ? 'ชาย' : 'หญิง';

  if (!firstName || !lastName) {
    alert('กรุณากรอกชื่อและนามสกุล');
    return;
  }

  if (id) {
    const idx = state.students.findIndex(s => s.id === Number(id));
    if (idx !== -1) {
      state.students[idx] = { ...state.students[idx], studentNumber, studentCode, prefix, firstName, lastName, gender, status, gradeLevel, avatar: avatar || state.students[idx].avatar || '' };
      showToast('แก้ไขข้อมูลนักเรียนเรียบร้อย', 'success');
    }
  } else {
    const newId = state.students.length > 0 ? Math.max(...state.students.map(s => s.id)) + 1 : 1;
    const newStudent = { id: newId, studentNumber, studentCode, prefix, firstName, lastName, gender, status, gradeLevel, avatar };
    state.students.push(newStudent);

    state.readingAssessments[newId] = { item1: 3, item2: 3, item3: 3, summary: 3 };
    state.characteristicsAssessments[newId] = { c1: 3, c2: 3, c3: 3, c4: 3, c5: 3, c6: 3, c7: 3, c8: 3, summary: 3 };
    state.competenciesAssessments[newId] = { k1: 3, k2: 3, k3: 3, k4: 3, k5: 3, summary: 3 };
    showToast('เพิ่มนักเรียนเรียบร้อยแล้ว', 'success');
  }

  closeStudentModal();
  saveData(false);
  renderAll();
}

function editStudent(id) {
  const st = state.students.find(s => s.id === id);
  if (st) openStudentModal(st);
}

function deleteStudent(id) {
  const st = state.students.find(s => s.id === id);
  if (!st) return;
  if (confirm(`คุณต้องการลบ "${st.prefix}${st.firstName} ${st.lastName}" ใช่หรือไม่?`)) {
    state.students = state.students.filter(s => s.id !== id);
    delete state.readingAssessments[id];
    delete state.characteristicsAssessments[id];
    delete state.competenciesAssessments[id];
    saveData(false);
    renderAll();
    showToast('ลบนักเรียนเรียบร้อยแล้ว', 'info');
  }
}

/* ==========================================================================
   7. Student File Upload / Import Logic (Excel / CSV / Paste)
   ========================================================================== */
function openImportModal() {
  const modal = document.getElementById('import-modal');
  tempParsedStudents = [];
  const preview = document.getElementById('import-preview-wrapper');
  if (preview) preview.style.display = 'none';
  const btn = document.getElementById('btn-confirm-import');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-file-import"></i> ยืนยันการนำเข้า';
  }
  const btnTop = document.getElementById('btn-confirm-import-top');
  if (btnTop) btnTop.style.display = 'none';
  const paste = document.getElementById('import-paste-text');
  if (paste) paste.value = '';
  const file = document.getElementById('import-file-input');
  if (file) file.value = '';
  switchImportTab('file');
  if (modal) modal.classList.add('open');
}

function closeImportModal() {
  const modal = document.getElementById('import-modal');
  if (modal) modal.classList.remove('open');
}

function switchImportTab(tab) {
  const btnFile = document.getElementById('tab-btn-file');
  const btnPaste = document.getElementById('tab-btn-paste');
  const paneFile = document.getElementById('import-pane-file');
  const panePaste = document.getElementById('import-pane-paste');

  if (tab === 'file') {
    btnFile.classList.add('active');
    btnPaste.classList.remove('active');
    paneFile.style.display = 'block';
    panePaste.style.display = 'none';
  } else {
    btnFile.classList.remove('active');
    btnPaste.classList.add('active');
    paneFile.style.display = 'none';
    panePaste.style.display = 'block';
  }
}

function setupDragAndDrop() {
  const dropzone = document.getElementById('dropzone-box');
  if (!dropzone) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      processStudentFile(files[0]);
    }
  }, false);
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    processStudentFile(file);
  }
}

function processStudentFile(file) {
  const fileName = file.name.toLowerCase();
  showToast(`กำลังประมวลผลไฟล์: ${file.name}`, 'info');

  if (fileName.endsWith('.json')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        const list = Array.isArray(json) ? json : (json.students || []);
        parseAndPreviewList(list);
      } catch (err) {
        alert('รูปแบบไฟล์ JSON ไม่ถูกต้อง');
      }
    };
    reader.readAsText(file);
  } else if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      parseCsvText(e.target.result);
    };
    reader.readAsText(file, 'UTF-8');
  } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    if (typeof XLSX === 'undefined') {
      alert('ไลบรารีอ่านไฟล์ Excel กำลังโหลด กรุณาลองใหม่อีกครั้ง');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        parseArrayRows(rows);
      } catch (err) {
        alert('เกิดข้อผิดพลาดในการอ่านไฟล์ Excel: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    alert('รองรับเฉพาะไฟล์ .xlsx, .xls, .csv, .txt หรือ .json');
  }
}

function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  const rows = lines.map(line => {
    // Check delimiter (tab or comma)
    if (line.includes('\t')) return line.split('\t').map(c => c.trim().replace(/^["']|["']$/g, ''));
    return line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
  });
  parseArrayRows(rows);
}

function parsePastedText() {
  const text = document.getElementById('import-paste-text').value.trim();
  if (!text) {
    alert('กรุณาวางข้อความจากตาราง Excel ก่อน');
    return;
  }
  parseCsvText(text);
}

function parseArrayRows(rows) {
  const list = [];
  let startIndex = 0;

  if (!rows || rows.length === 0) return;

  // Check if first row is header
  const firstRowStr = rows[0].map(c => String(c || '')).join(' ').toLowerCase();
  if (firstRowStr.includes('ชั้น') || firstRowStr.includes('เลขที่') || firstRowStr.includes('รหัส') || 
      firstRowStr.includes('คำนำหน้า') || firstRowStr.includes('ชื่อ') || firstRowStr.includes('นามสกุล') || 
      firstRowStr.includes('เพศ') || firstRowStr.includes('name') || firstRowStr.includes('code') || 
      firstRowStr.includes('gender') || firstRowStr.includes('student')) {
    startIndex = 1;
  }

  for (let i = startIndex; i < rows.length; i++) {
    const rawRow = rows[i];
    if (!rawRow || rawRow.length === 0) continue;
    
    // Clean each cell
    const row = rawRow.map(c => (c !== null && c !== undefined) ? String(c).trim() : '');
    if (row.every(c => !c)) continue;

    let grade = state.schoolInfo.gradeLevel || 'ประถมศึกษาปีที่ 1';
    let code = '';
    let prefix = 'เด็กชาย';
    let firstName = '';
    let lastName = '';
    let gender = 'ชาย';

    // Strategy: Column Content Analysis
    let colGrade = -1, colCode = -1, colPrefix = -1, colFirst = -1, colLast = -1, colGender = -1;

    row.forEach((cell, colIdx) => {
      const val = cell.trim();
      if (!val) return;

      // Grade pattern
      if (colGrade === -1 && (val.match(/^ป\.[1-6]/i) || val.match(/^ประถม/i) || val.match(/^ม\.[1-6]/i) || val.match(/^ชั้น/i))) {
        colGrade = colIdx;
      }
      // Prefix pattern
      else if (colPrefix === -1 && (val === 'เด็กชาย' || val === 'เด็กหญิง' || val === 'ด.ช.' || val === 'ด.ช' || val === 'ด.ญ.' || val === 'ด.ญ' || val === 'นาย' || val === 'นางสาว' || val === 'น.ส.' || val === 'นาง')) {
        colPrefix = colIdx;
      }
      // Gender pattern
      else if (colGender === -1 && (val === 'ชาย' || val === 'หญิง' || val === 'ช' || val === 'ญ' || val === 'M' || val === 'F' || val.toLowerCase() === 'male' || val.toLowerCase() === 'female')) {
        colGender = colIdx;
      }
      // Code pattern (3-10 alphanumeric or numeric)
      else if (colCode === -1 && colFirst === -1 && (val.match(/^\d{3,10}$/) || val.match(/^[A-Z0-9]{4,10}$/i))) {
        colCode = colIdx;
      }
    });

    // Extract prefix
    if (colPrefix !== -1) {
      let p = row[colPrefix].trim();
      if (p === 'ด.ช.' || p === 'ด.ช') p = 'เด็กชาย';
      if (p === 'ด.ญ.' || p === 'ด.ญ') p = 'เด็กหญิง';
      if (p === 'น.ส.') p = 'นางสาว';
      prefix = p;
    }

    // Extract grade
    if (colGrade !== -1) {
      grade = row[colGrade].trim();
    }

    // Extract gender
    if (colGender !== -1) {
      const g = row[colGender].trim();
      if (g === 'ช' || g === 'ชาย' || g === 'M' || g.toLowerCase() === 'male') gender = 'ชาย';
      else if (g === 'ญ' || g === 'หญิง' || g === 'F' || g.toLowerCase() === 'female') gender = 'หญิง';
      else gender = (prefix === 'เด็กหญิง' || prefix === 'นางสาว' || prefix === 'นาง') ? 'หญิง' : 'ชาย';
    } else {
      gender = (prefix === 'เด็กหญิง' || prefix === 'นางสาว' || prefix === 'นาง') ? 'หญิง' : 'ชาย';
    }

    // Extract names based on prefix position
    if (colPrefix !== -1 && row[colPrefix + 1]) {
      firstName = row[colPrefix + 1].trim();
      if (row[colPrefix + 2] && colPrefix + 2 !== colGender) {
        lastName = row[colPrefix + 2].trim();
      }
    }

    // Fallback if not extracted by prefix:
    if (!firstName) {
      if (row.length >= 6) {
        if (row[0].match(/^ป\.[1-6]/) || row[0].match(/^ประถม/)) grade = row[0];
        code = row[1];
        prefix = row[2] || 'เด็กชาย';
        firstName = row[3];
        lastName = row[4];
        if (row[5]) {
          const g = row[5];
          gender = (g === 'ช' || g === 'ชาย') ? 'ชาย' : (g === 'ญ' || g === 'หญิง' ? 'หญิง' : (prefix.includes('หญิง') || prefix.includes('นาง') ? 'หญิง' : 'ชาย'));
        }
      } else if (row.length === 5) {
        if (row[0].match(/^ป\.[1-6]/) || row[0].match(/^ประถม/)) {
          grade = row[0];
          code = row[1];
          prefix = row[2] || 'เด็กชาย';
          firstName = row[3];
          lastName = row[4];
        } else {
          code = row[0];
          prefix = row[1] || 'เด็กชาย';
          firstName = row[2];
          lastName = row[3];
          if (row[4]) {
            const g = row[4];
            gender = (g === 'ช' || g === 'ชาย') ? 'ชาย' : (g === 'ญ' || g === 'หญิง' ? 'หญิง' : (prefix.includes('หญิง') || prefix.includes('นาง') ? 'หญิง' : 'ชาย'));
          }
        }
      } else if (row.length === 4) {
        code = row[0];
        prefix = row[1];
        firstName = row[2];
        lastName = row[3];
      } else if (row.length === 3) {
        prefix = row[0];
        firstName = row[1];
        lastName = row[2];
      } else if (row.length === 2) {
        firstName = row[0];
        lastName = row[1];
      } else if (row.length === 1 && row[0]) {
        const parts = row[0].split(/\s+/);
        if (parts.length >= 3) {
          prefix = parts[0];
          firstName = parts[1];
          lastName = parts.slice(2).join(' ');
        } else if (parts.length === 2) {
          firstName = parts[0];
          lastName = parts[1];
        } else {
          firstName = parts[0];
        }
      }
    }

    if (prefix === 'ด.ช.' || prefix === 'ด.ช') prefix = 'เด็กชาย';
    if (prefix === 'ด.ญ.' || prefix === 'ด.ญ') prefix = 'เด็กหญิง';
    if (prefix === 'น.ส.' || prefix === 'น.ส') prefix = 'นางสาว';

    if (prefix === 'เด็กหญิง' || prefix === 'นางสาว' || prefix === 'นาง') {
      gender = 'หญิง';
    } else if (prefix === 'เด็กชาย' || prefix === 'นาย') {
      gender = 'ชาย';
    }

    if (!code) {
      code = colCode !== -1 ? row[colCode] : `690${String(list.length + 1).padStart(2, '0')}`;
    }

    if (firstName) {
      list.push({
        id: list.length + 1,
        gradeLevel: grade || state.schoolInfo.gradeLevel || 'ประถมศึกษาปีที่ 1',
        studentCode: String(code).trim(),
        prefix: prefix,
        firstName: firstName.trim(),
        lastName: (lastName || '-').trim(),
        gender: gender,
        status: 'กำลังศึกษา'
      });
    }
  }

  parseAndPreviewList(list);
}

function parseAndPreviewList(list) {
  if (!list || list.length === 0) {
    alert('ไม่พบรายชื่อนักเรียนในไฟล์ กรุณาตรวจสอบรูปแบบไฟล์');
    return;
  }

  tempParsedStudents = list;
  const wrapper = document.getElementById('import-preview-wrapper');
  const countEl = document.getElementById('import-preview-count');
  const tbody = document.getElementById('import-preview-tbody');
  const btnConfirm = document.getElementById('btn-confirm-import');
  const btnConfirmTop = document.getElementById('btn-confirm-import-top');

  if (wrapper) {
    wrapper.style.display = 'block';
    setTimeout(() => {
      wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  }

  if (countEl) countEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> ตรวจพบข้อมูลนักเรียนทั้งหมด <strong>${list.length}</strong> คน`;
  
  if (btnConfirm) {
    btnConfirm.disabled = false;
    btnConfirm.innerHTML = `<i class="fa-solid fa-file-import"></i> ยืนยันการนำเข้า (${list.length} คน)`;
  }

  if (btnConfirmTop) {
    btnConfirmTop.style.display = 'inline-flex';
    btnConfirmTop.innerHTML = `<i class="fa-solid fa-file-import"></i> ยืนยันการนำเข้า (${list.length} คน)`;
  }

  if (tbody) {
    tbody.innerHTML = list.slice(0, 10).map((st) => `
      <tr>
        <td style="text-align: center;"><span class="badge-score" style="background: #e0f2fe; color: #0284c7; font-weight: 700; border: 1px solid #bae6fd;">${formatShortGrade(st.gradeLevel || state.schoolInfo.gradeLevel || 'ป.1')}</span></td>
        <td style="font-family: monospace; font-weight: 600; color: var(--primary-blue);">${st.studentCode || '-'}</td>
        <td>${st.prefix || ''}</td>
        <td><strong>${st.firstName}</strong></td>
        <td>${st.lastName}</td>
        <td style="text-align: center;">
          <span class="badge-score" style="background: ${st.gender === 'ชาย' ? '#eff6ff' : '#fdf2f8'}; color: ${st.gender === 'ชาย' ? '#2563eb' : '#db2777'};">
            ${st.gender || '-'}
          </span>
        </td>
      </tr>
    `).join('') + (list.length > 10 ? `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); font-weight: 600; padding: 0.6rem;">... และอีก ${list.length - 10} คน ...</td></tr>` : '');
  }
}

function confirmStudentImport() {
  if (!tempParsedStudents || tempParsedStudents.length === 0) {
    alert('ไม่มีข้อมูลนักเรียนที่จะนำเข้า กรุณาเลือกไฟล์ก่อน');
    return;
  }

  const modeRadio = document.querySelector('input[name="import-mode"]:checked');
  const mode = modeRadio ? modeRadio.value : 'replace';

  if (mode === 'replace') {
    state.students = tempParsedStudents.map((st, idx) => ({ ...st, id: idx + 1 }));
    state.readingAssessments = {};
    state.characteristicsAssessments = {};
    state.competenciesAssessments = {};

    state.students.forEach(st => {
      state.readingAssessments[st.id] = { item1: 3, item2: 3, item3: 3, summary: 3 };
      state.characteristicsAssessments[st.id] = { c1: 3, c2: 3, c3: 3, c4: 3, c5: 3, c6: 3, c7: 3, c8: 3, summary: 3 };
      state.competenciesAssessments[st.id] = { k1: 3, k2: 3, k3: 3, k4: 3, k5: 3, summary: 3 };
    });
  } else {
    // Append
    const currentMaxId = state.students.length > 0 ? Math.max(...state.students.map(s => s.id)) : 0;
    tempParsedStudents.forEach((st, idx) => {
      const newId = currentMaxId + idx + 1;
      state.students.push({ ...st, id: newId });
      state.readingAssessments[newId] = { item1: 3, item2: 3, item3: 3, summary: 3 };
      state.characteristicsAssessments[newId] = { c1: 3, c2: 3, c3: 3, c4: 3, c5: 3, c6: 3, c7: 3, c8: 3, summary: 3 };
      state.competenciesAssessments[newId] = { k1: 3, k2: 3, k3: 3, k4: 3, k5: 3, summary: 3 };
    });
  }

  const totalCount = tempParsedStudents.length;
  tempParsedStudents = [];

  // Reset inputs
  const fileInput = document.getElementById('import-file-input');
  if (fileInput) fileInput.value = '';
  const pasteInput = document.getElementById('import-paste-text');
  if (pasteInput) pasteInput.value = '';
  const previewWrapper = document.getElementById('import-preview-wrapper');
  if (previewWrapper) previewWrapper.style.display = 'none';

  saveData(false);
  renderAll();
  closeImportModal();
  switchTab('tab-students');
  showToast(`นำเข้าข้อมูลนักเรียน ${totalCount} คน เข้าสู่ระบบเรียบร้อยแล้ว`, 'success');
}

function downloadStudentTemplate() {
  const csvContent = "\uFEFFชั้น,รหัสประจำตัว,คำนำหน้า,ชื่อ,นามสกุล,เพศ\nป.1,69001,เด็กชาย,กิตติศักดิ์,ทองคำ,ชาย\nป.1,69002,เด็กหญิง,กานต์พิชชา,มั่นคง,หญิง\nป.1,69003,เด็กชาย,ปรเมศวร์,แสงสว่าง,ชาย\nป.1,69004,เด็กหญิง,ณิชานันท์,สุขเกษม,หญิง";
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', 'แบบฟอร์มรายชื่อนักเรียน_ตัวอย่าง.csv');
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast('ดาวน์โหลดแม่แบบไฟล์นักเรียนเรียบร้อย', 'info');
}

/* ==========================================================================
   8. Evaluation Forms (ช่องที่ 4, 5, 6) - การประเมินตามเกณฑ์ทางการ สพฐ.
   ========================================================================== */
let currentReadingSubView = 'summary'; // 'summary' | 'reading' | 'thinking' | 'writing' | 'terms'

function calculateMode(numbers) {
  if (!numbers || !Array.isArray(numbers) || numbers.length === 0) return 3;
  const validNums = numbers.map(n => Number(n)).filter(n => !isNaN(n));
  if (validNums.length === 0) return 3;
  
  const freq = {};
  let maxFreq = 0;
  let modeVal = validNums[0];

  validNums.forEach(n => {
    freq[n] = (freq[n] || 0) + 1;
    if (freq[n] > maxFreq) {
      maxFreq = freq[n];
      modeVal = n;
    } else if (freq[n] === maxFreq) {
      if (n > modeVal) modeVal = n; // In case of tie, reward the higher grade
    }
  });

  return modeVal;
}

function toggleReadingCriteriaPanel() {
  const panel = document.getElementById('reading-criteria-panel');
  if (panel) {
    panel.classList.toggle('open');
  }
}

function switchReadingSubView(subView) {
  currentReadingSubView = subView;
  
  // Update sub-nav button active classes
  const btns = document.querySelectorAll('.eval-subnav-btn');
  btns.forEach(b => b.classList.remove('active'));
  
  const targetBtn = document.getElementById(`btn-subview-${subView}`);
  if (targetBtn) targetBtn.classList.add('active');

  const titleEl = document.getElementById('reading-view-title');
  if (titleEl) {
    const titles = {
      'summary': 'ตารางสรุปผลการประเมิน 3 ด้าน',
      'reading': 'ตารางประเมิน ด้านที่ 1: ด้านการอ่าน (5 ตัวชี้วัด)',
      'thinking': 'ตารางประเมิน ด้านที่ 2: ด้านการคิดวิเคราะห์ (5 ตัวชี้วัด)',
      'writing': 'ตารางประเมิน ด้านที่ 3: ด้านการเขียนสื่อความ (5 ตัวชี้วัด)',
      'terms': 'ตารางสรุปผลการประเมิน เปรียบเทียบ 2 ภาคเรียน (ภ.1 / ภ.2 / ปลายปี)'
    };
    titleEl.textContent = titles[subView] || 'ตารางบันทึกผลการประเมิน';
  }

  renderReadingTable();
}

function renderScoreSelect(type, studentId, field, currentVal) {
  const val = Number(currentVal !== undefined ? currentVal : 0);
  return `
    <select class="score-select" onchange="updateReadingScore(${studentId}, '${field}', this.value)" style="padding: 0.15rem 0.35rem; font-size: 0.8rem; font-weight: 600;">
      <option value="3" ${val === 3 ? 'selected' : ''}>3 (ดีเยี่ยม)</option>
      <option value="2" ${val === 2 ? 'selected' : ''}>2 (ดี)</option>
      <option value="1" ${val === 1 ? 'selected' : ''}>1 (ผ่าน)</option>
      <option value="0" ${val === 0 ? 'selected' : ''}>0 (ไม่ผ่าน)</option>
    </select>
  `;
}

function updateReadingScore(studentId, field, value) {
  const numVal = parseInt(value, 10);
  const s = getStudentReadingScores(studentId);
  s[field] = numVal;

  if (field === 'item1' && s.readingItems) {
    s.readingItems = [numVal, numVal, numVal, numVal, numVal];
  } else if (field === 'item2' && s.thinkingItems) {
    s.thinkingItems = [numVal, numVal, numVal, numVal, numVal];
  } else if (field === 'item3' && s.writingItems) {
    s.writingItems = [numVal, numVal, numVal, numVal, numVal];
  }

  s.summary = calculateMode([s.item1, s.item2, s.item3]);

  if (s.term1) {
    s.term1.reading = s.item1;
    s.term1.thinking = s.item2;
    s.term1.writing = s.item3;
    s.term1.summary = s.summary;
  }

  saveData(false);

  const summaryEl = document.getElementById(`reading-summary-${studentId}`);
  if (summaryEl) summaryEl.innerHTML = getScoreBadge(s.summary);

  updateDashboardKpis();
}

function renderReadingTable() {
  const thead = document.getElementById('reading-table-header') || document.querySelector('#reading-table thead');
  const tbody = document.getElementById('reading-table-body');
  if (!tbody) return;

  const students = getStudentsForActiveGrade();
  const currentGrade = state.schoolInfo.gradeLevel || 'ประถมศึกษาปีที่ 1';
  const gradeLabel = currentGrade === 'ทั้งหมด' ? 'ทุกระดับชั้น' : (currentGrade.startsWith('ชั้น') ? currentGrade : `ชั้น${currentGrade}`);

  if (students.length === 0) {
    if (thead) thead.innerHTML = `<tr><th>เลขที่</th><th>ชั้น</th><th>รหัส</th><th>ชื่อ - นามสกุล</th><th>สรุปผล</th></tr>`;
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">ไม่พบข้อมูลนักเรียนใน ${gradeLabel} กรุณาเพิ่มหรือนำเข้าข้อมูลนักเรียน</td></tr>`;
    return;
  }

  // 1. SUB-VIEW: SUMMARY (สรุปภาพรวม 3 ด้าน)
  if (currentReadingSubView === 'summary') {
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th style="width: 50px; text-align: center;">เลขที่</th>
          <th style="width: 80px; text-align: center;">ชั้น</th>
          <th style="width: 100px;">รหัสนักเรียน</th>
          <th>ชื่อ - นามสกุล</th>
          <th style="width: 110px; text-align: center;" title="1. ด้านการอ่าน (5 ตัวชี้วัด)">การอ่าน (5)</th>
          <th style="width: 110px; text-align: center;" title="2. ด้านการคิดวิเคราะห์ (5 ตัวชี้วัด)">คิดวิเคราะห์ (5)</th>
          <th style="width: 110px; text-align: center;" title="3. ด้านการเขียนสื่อความ (5 ตัวชี้วัด)">เขียนสื่อความ (5)</th>
          <th style="width: 120px; text-align: center;" title="สรุปผลการประเมินโดยใช้ค่า Mode">ผลสรุป (Mode)</th>
          <th style="width: 90px; text-align: center;">บันทึกละเอียด</th>
        </tr>
      `;
    }

    tbody.innerHTML = students.map((st, idx) => {
      const stNum = (st.studentNumber && String(st.studentNumber).trim() !== '' && String(st.studentNumber).trim() !== '-') ? st.studentNumber : (idx + 1);
      const shortGrade = formatShortGrade(st.gradeLevel || state.schoolInfo.gradeLevel || 'ป.1');
      const scores = getStudentReadingScores(st.id);
      return `
        <tr>
          <td style="text-align: center; font-weight: 600;">${stNum}</td>
          <td style="text-align: center;">
            <span class="badge-score" style="background: #e0f2fe; color: #0284c7; font-weight: 700; font-size: 0.8rem; padding: 0.2rem 0.55rem; border: 1px solid #bae6fd; border-radius: 6px;">
              ${shortGrade}
            </span>
          </td>
          <td style="font-family: monospace; font-weight: 600; color: var(--primary-blue);">${st.studentCode || '-'}</td>
          <td><strong>${st.prefix || ''}${st.firstName || ''} ${st.lastName || ''}</strong></td>
          <td style="text-align: center;">${renderScoreSelect('reading', st.id, 'item1', scores.item1)}</td>
          <td style="text-align: center;">${renderScoreSelect('reading', st.id, 'item2', scores.item2)}</td>
          <td style="text-align: center;">${renderScoreSelect('reading', st.id, 'item3', scores.item3)}</td>
          <td style="text-align: center;" id="reading-summary-${st.id}">${getScoreBadge(scores.summary)}</td>
          <td style="text-align: center;">
            <button class="btn btn-outline btn-sm" onclick="openReadingDetailModal(${st.id})" title="ประเมินละเอียด 15 ตัวชี้วัด" style="padding: 0.2rem 0.6rem; font-size: 0.8rem; color: var(--primary-blue); border-color: #bfdbfe; background: #eff6ff;">
              <i class="fa-solid fa-sliders"></i> 15 ตัวชี้วัด
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }
  // 2. SUB-VIEW: READING DOMAIN 1 (ด้านการอ่าน 5 ตัวชี้วัด)
  else if (currentReadingSubView === 'reading') {
    thead.innerHTML = `
      <tr>
        <th style="width: 45px; text-align: center;">เลขที่</th>
        <th style="width: 70px; text-align: center;">ชั้น</th>
        <th style="width: 85px;">รหัส</th>
        <th style="min-width: 170px;">ชื่อ - นามสกุล</th>
        <th style="text-align: center; font-size: 0.82rem;" title="1.1 อ่านออกเสียงร้อยแก้ว ร้อยกรองถูกต้องตามอักขรวิธี">1.1 อ่านออกเสียง</th>
        <th style="text-align: center; font-size: 0.82rem;" title="1.2 อ่านในใจ เข้าใจความหมายของคำ สำนวน ��้อหา">1.2 อ่านในใจ</th>
        <th style="text-align: center; font-size: 0.82rem;" title="1.3 เลือกอ่านหนังสือที่เป็นประโยชน์">1.3 เลือกอ่าน</th>
        <th style="text-align: center; font-size: 0.82rem;" title="1.4 ตอบคำถาม สรุปสาระสำคัญ และข้อคิด">1.4 ตอบคำถาม</th>
        <th style="text-align: center; font-size: 0.82rem;" title="1.5 เห็นคุณค่า มีนิสัยรักการอ่าน">1.5 รักการอ่าน</th>
        <th style="width: 110px; text-align: center;">สรุปด้านที่ 1 (Mode)</th>
      </tr>
    `;

    tbody.innerHTML = students.map((st, idx) => {
      const stNum = (st.studentNumber && String(st.studentNumber).trim() !== '' && String(st.studentNumber).trim() !== '-') ? st.studentNumber : (idx + 1);
      const shortGrade = formatShortGrade(st.gradeLevel || state.schoolInfo.gradeLevel || 'ป.1');
      const scores = getStudentReadingScores(st.id);
      const rItems = scores.readingItems || [scores.item1, scores.item1, scores.item1, scores.item1, scores.item1];
      const domainMode = calculateMode(rItems);
      return `
        <tr>
          <td style="text-align: center; font-weight: 600;">${stNum}</td>
          <td style="text-align: center;">
            <span class="badge-score" style="background: #e0f2fe; color: #0284c7; font-weight: 700; font-size: 0.8rem; padding: 0.2rem 0.55rem; border: 1px solid #bae6fd; border-radius: 6px;">
              ${shortGrade}
            </span>
          </td>
          <td style="font-family: monospace; font-weight: 600; color: var(--primary-blue);">${st.studentCode || '-'}</td>
          <td><strong>${st.prefix || ''}${st.firstName || ''} ${st.lastName || ''}</strong></td>
          <td style="text-align: center;">${renderIndicatorSelect(st.id, 'reading', 0, rItems[0])}</td>
          <td style="text-align: center;">${renderIndicatorSelect(st.id, 'reading', 1, rItems[1])}</td>
          <td style="text-align: center;">${renderIndicatorSelect(st.id, 'reading', 2, rItems[2])}</td>
          <td style="text-align: center;">${renderIndicatorSelect(st.id, 'reading', 3, rItems[3])}</td>
          <td style="text-align: center;">${renderIndicatorSelect(st.id, 'reading', 4, rItems[4])}</td>
          <td style="text-align: center;" id="reading-d1-mode-${st.id}">${getScoreBadge(domainMode)}</td>
        </tr>
      `;
    }).join('');
  }
  // 3. SUB-VIEW: THINKING DOMAIN 2 (ด้านการคิดวิเคราะห์ 5 ตัวชี้วัด)
  else if (currentReadingSubView === 'thinking') {
    thead.innerHTML = `
      <tr>
        <th style="width: 45px; text-align: center;">เลขที่</th>
        <th style="width: 70px; text-align: center;">ชั้น</th>
        <th style="width: 85px;">รหัส</th>
        <th style="min-width: 170px;">ชื่อ - นามสกุล</th>
        <th style="text-align: center; font-size: 0.82rem;" title="2.1 ระบุข้อเท็จจริง ความคิดเห็น">2.1 ข้อเท็จจริง</th>
        <th style="text-align: center; font-size: 0.82rem;" title="2.2 สรุปสาระสำคัญ บอกความสัมพันธ์">2.2 สรุปสาระ</th>
        <th style="text-align: center; font-size: 0.82rem;" title="2.3 แสดงความคิดเห็นเกี่ยวกับเรื่องที่อ่าน">2.3 แสดงความคิด</th>
        <th style="text-align: center; font-size: 0.82rem;" title="2.4 แยกผลดีและผลเสียของข้อมูล">2.4 ผลดี/ผลเสีย</th>
        <th style="text-align: center; font-size: 0.82rem;" title="2.5 นำข้อมูลไปใช้ประโยชน์">2.5 นำไปใช้</th>
        <th style="width: 110px; text-align: center;">สรุปด้านที่ 2 (Mode)</th>
      </tr>
    `;

    tbody.innerHTML = students.map((st, idx) => {
      const stNum = (st.studentNumber && String(st.studentNumber).trim() !== '' && String(st.studentNumber).trim() !== '-') ? st.studentNumber : (idx + 1);
      const shortGrade = formatShortGrade(st.gradeLevel || state.schoolInfo.gradeLevel || 'ป.1');
      const scores = getStudentReadingScores(st.id);
      const tItems = scores.thinkingItems || [scores.item2, scores.item2, scores.item2, scores.item2, scores.item2];
      const domainMode = calculateMode(tItems);
      return `
        <tr>
          <td style="text-align: center; font-weight: 600;">${stNum}</td>
          <td style="text-align: center;">
            <span class="badge-score" style="background: #e0f2fe; color: #0284c7; font-weight: 700; font-size: 0.8rem; padding: 0.2rem 0.55rem; border: 1px solid #bae6fd; border-radius: 6px;">
              ${shortGrade}
            </span>
          </td>
          <td style="font-family: monospace; font-weight: 600; color: var(--primary-blue);">${st.studentCode || '-'}</td>
          <td><strong>${st.prefix || ''}${st.firstName || ''} ${st.lastName || ''}</strong></td>
          <td style="text-align: center;">${renderIndicatorSelect(st.id, 'thinking', 0, tItems[0])}</td>
          <td style="text-align: center;">${renderIndicatorSelect(st.id, 'thinking', 1, tItems[1])}</td>
          <td style="text-align: center;">${renderIndicatorSelect(st.id, 'thinking', 2, tItems[2])}</td>
          <td style="text-align: center;">${renderIndicatorSelect(st.id, 'thinking', 3, tItems[3])}</td>
          <td style="text-align: center;">${renderIndicatorSelect(st.id, 'thinking', 4, tItems[4])}</td>
          <td style="text-align: center;" id="reading-d2-mode-${st.id}">${getScoreBadge(domainMode)}</td>
        </tr>
      `;
    }).join('');
  }
  // 4. SUB-VIEW: WRITING DOMAIN 3 (ด้านการเขียนสื่อความ 5 ตัวชี้วัด)
  else if (currentReadingSubView === 'writing') {
    thead.innerHTML = `
      <tr>
        <th style="width: 45px; text-align: center;">เลขที่</th>
        <th style="width: 70px; text-align: center;">ชั้น</th>
        <th style="width: 85px;">รหัส</th>
        <th style="min-width: 170px;">ชื่อ - นามสกุล</th>
        <th style="text-align: center; font-size: 0.82rem;" title="3.1 เขียนจดหมาย เรียงความ ย่อความ">3.1 รูปแบบการเขียน</th>
        <th style="text-align: center; font-size: 0.82rem;" title="3.2 เขียนบันทึกประสบการณ์ จินตนาการ">3.2 ประสบการณ์</th>
        <th style="text-align: center; font-size: 0.82rem;" title="3.3 เลือกใช้คำ สำนวนเหมาะสม">3.3 ใช้คำ/สำนวน</th>
        <th style="text-align: center; font-size: 0.82rem;" title="3.4 ลายมือสวยงาม อ่านง่าย">3.4 ลายมือสวย</th>
        <th style="text-align: center; font-size: 0.82rem;" title="3.5 มีนิสัยรักการเขียนและมีมารยาท">3.5 รักการเขียน</th>
        <th style="width: 110px; text-align: center;">สรุปด้านที่ 3 (Mode)</th>
      </tr>
    `;

    tbody.innerHTML = students.map((st, idx) => {
      const stNum = (st.studentNumber && String(st.studentNumber).trim() !== '' && String(st.studentNumber).trim() !== '-') ? st.studentNumber : (idx + 1);
      const shortGrade = formatShortGrade(st.gradeLevel || state.schoolInfo.gradeLevel || 'ป.1');
      const scores = getStudentReadingScores(st.id);
      const wItems = scores.writingItems || [scores.item3, scores.item3, scores.item3, scores.item3, scores.item3];
      const domainMode = calculateMode(wItems);
      return `
        <tr>
          <td style="text-align: center; font-weight: 600;">${stNum}</td>
          <td style="text-align: center;">
            <span class="badge-score" style="background: #e0f2fe; color: #0284c7; font-weight: 700; font-size: 0.8rem; padding: 0.2rem 0.55rem; border: 1px solid #bae6fd; border-radius: 6px;">
              ${shortGrade}
            </span>
          </td>
          <td style="font-family: monospace; font-weight: 600; color: var(--primary-blue);">${st.studentCode || '-'}</td>
          <td><strong>${st.prefix || ''}${st.firstName || ''} ${st.lastName || ''}</strong></td>
          <td style="text-align: center;">${renderIndicatorSelect(st.id, 'writing', 0, wItems[0])}</td>
          <td style="text-align: center;">${renderIndicatorSelect(st.id, 'writing', 1, wItems[1])}</td>
          <td style="text-align: center;">${renderIndicatorSelect(st.id, 'writing', 2, wItems[2])}</td>
          <td style="text-align: center;">${renderIndicatorSelect(st.id, 'writing', 3, wItems[3])}</td>
          <td style="text-align: center;">${renderIndicatorSelect(st.id, 'writing', 4, wItems[4])}</td>
          <td style="text-align: center;" id="reading-d3-mode-${st.id}">${getScoreBadge(domainMode)}</td>
        </tr>
      `;
    }).join('');
  }
  // 5. SUB-VIEW: 2-TERM FULL SUMMARY (ตารางสรุปเปรียบเทียบ 2 ภาคเรียน)
  else if (currentReadingSubView === 'terms') {
    thead.innerHTML = `
      <tr>
        <th rowspan="2" style="width: 45px; text-align: center; vertical-align: middle;">เลขที่</th>
        <th rowspan="2" style="width: 65px; text-align: center; vertical-align: middle;">ชั้น</th>
        <th rowspan="2" style="width: 80px; vertical-align: middle;">รหัส</th>
        <th rowspan="2" style="min-width: 160px; vertical-align: middle;">ชื่อ - นามสกุล</th>
        <th colspan="3" style="text-align: center; border-bottom: 1px solid var(--border-subtle); background: #f0f9ff; color: #0369a1;">1. การอ่าน</th>
        <th colspan="3" style="text-align: center; border-bottom: 1px solid var(--border-subtle); background: #faf5ff; color: #6d28d9;">2. คิดวิเคราะห์</th>
        <th colspan="3" style="text-align: center; border-bottom: 1px solid var(--border-subtle); background: #f0fdf4; color: #047857;">3. เขียนสื่อความ</th>
        <th rowspan="2" style="width: 100px; text-align: center; vertical-align: middle;">สรุปทั้งปี</th>
      </tr>
      <tr>
        <th style="text-align: center; font-size: 0.78rem;">ภ.1</th>
        <th style="text-align: center; font-size: 0.78rem;">ภ.2</th>
        <th style="text-align: center; font-size: 0.78rem; font-weight: 700;">สรุป</th>
        <th style="text-align: center; font-size: 0.78rem;">ภ.1</th>
        <th style="text-align: center; font-size: 0.78rem;">ภ.2</th>
        <th style="text-align: center; font-size: 0.78rem; font-weight: 700;">สรุป</th>
        <th style="text-align: center; font-size: 0.78rem;">ภ.1</th>
        <th style="text-align: center; font-size: 0.78rem;">ภ.2</th>
        <th style="text-align: center; font-size: 0.78rem; font-weight: 700;">สรุป</th>
      </tr>
    `;

    tbody.innerHTML = students.map((st, idx) => {
      const stNum = (st.studentNumber && String(st.studentNumber).trim() !== '' && String(st.studentNumber).trim() !== '-') ? st.studentNumber : (idx + 1);
      const shortGrade = formatShortGrade(st.gradeLevel || state.schoolInfo.gradeLevel || 'ป.1');
      const scores = getStudentReadingScores(st.id);
      const t1 = scores.term1 || { reading: scores.item1, thinking: scores.item2, writing: scores.item3, summary: scores.summary };
      const t2 = scores.term2 || { reading: scores.item1, thinking: scores.item2, writing: scores.item3, summary: scores.summary };
      return `
        <tr>
          <td style="text-align: center; font-weight: 600;">${stNum}</td>
          <td style="text-align: center;">
            <span class="badge-score" style="background: #e0f2fe; color: #0284c7; font-weight: 700; font-size: 0.8rem; padding: 0.2rem 0.55rem; border: 1px solid #bae6fd; border-radius: 6px;">
              ${shortGrade}
            </span>
          </td>
          <td style="font-family: monospace; font-weight: 600; color: var(--primary-blue);">${st.studentCode || '-'}</td>
          <td><strong>${st.prefix || ''}${st.firstName || ''} ${st.lastName || ''}</strong></td>
          
          <td style="text-align: center;"><span class="badge-score score-${t1.reading}">${t1.reading}</span></td>
          <td style="text-align: center;"><span class="badge-score score-${t2.reading}">${t2.reading}</span></td>
          <td style="text-align: center;"><strong><span class="badge-score score-${scores.item1}">${scores.item1}</span></strong></td>

          <td style="text-align: center;"><span class="badge-score score-${t1.thinking}">${t1.thinking}</span></td>
          <td style="text-align: center;"><span class="badge-score score-${t2.thinking}">${t2.thinking}</span></td>
          <td style="text-align: center;"><strong><span class="badge-score score-${scores.item2}">${scores.item2}</span></strong></td>

          <td style="text-align: center;"><span class="badge-score score-${t1.writing}">${t1.writing}</span></td>
          <td style="text-align: center;"><span class="badge-score score-${t2.writing}">${t2.writing}</span></td>
          <td style="text-align: center;"><strong><span class="badge-score score-${scores.item3}">${scores.item3}</span></strong></td>

          <td style="text-align: center;">${getScoreBadge(scores.summary)}</td>
        </tr>
      `;
    }).join('');
  }
}

function getStudentReadingScores(studentId) {
  if (!state.readingAssessments) state.readingAssessments = {};
  if (!state.readingAssessments[studentId]) {
    state.readingAssessments[studentId] = {
      item1: 0, item2: 0, item3: 0, summary: 0,
      readingItems: [0, 0, 0, 0, 0],
      thinkingItems: [0, 0, 0, 0, 0],
      writingItems: [0, 0, 0, 0, 0],
      term1: { reading: 0, thinking: 0, writing: 0, summary: 0 },
      term2: { reading: 0, thinking: 0, writing: 0, summary: 0 }
    };
  }
  const s = state.readingAssessments[studentId];
  const item1Val = s.item1 !== undefined ? s.item1 : 0;
  const item2Val = s.item2 !== undefined ? s.item2 : 0;
  const item3Val = s.item3 !== undefined ? s.item3 : 0;
  if (!s.readingItems) s.readingItems = [item1Val, item1Val, item1Val, item1Val, item1Val];
  if (!s.thinkingItems) s.thinkingItems = [item2Val, item2Val, item2Val, item2Val, item2Val];
  if (!s.writingItems) s.writingItems = [item3Val, item3Val, item3Val, item3Val, item3Val];
  return s;
}

function renderIndicatorSelect(studentId, domain, index, currentVal) {
  const val = Number(currentVal !== undefined ? currentVal : 0);
  return `
    <select class="score-select" onchange="updateReadingIndicatorScore(${studentId}, '${domain}', ${index}, this.value)" style="padding: 0.15rem 0.35rem; font-size: 0.8rem; font-weight: 600;">
      <option value="3" ${val === 3 ? 'selected' : ''}>3 (ดีเยี่ยม)</option>
      <option value="2" ${val === 2 ? 'selected' : ''}>2 (ดี)</option>
      <option value="1" ${val === 1 ? 'selected' : ''}>1 (ผ่าน)</option>
      <option value="0" ${val === 0 ? 'selected' : ''}>0 (ไม่ผ่าน)</option>
    </select>
  `;
}

function updateReadingIndicatorScore(studentId, domain, index, value) {
  const numVal = parseInt(value, 10);
  const s = getStudentReadingScores(studentId);

  if (domain === 'reading') {
    s.readingItems[index] = numVal;
    s.item1 = calculateMode(s.readingItems);
  } else if (domain === 'thinking') {
    s.thinkingItems[index] = numVal;
    s.item2 = calculateMode(s.thinkingItems);
  } else if (domain === 'writing') {
    s.writingItems[index] = numVal;
    s.item3 = calculateMode(s.writingItems);
  }

  // Calculate overall Mode across 3 domains
  s.summary = calculateMode([s.item1, s.item2, s.item3]);

  // Update live term records
  if (s.term1) {
    s.term1.reading = s.item1;
    s.term1.thinking = s.item2;
    s.term1.writing = s.item3;
    s.term1.summary = s.summary;
  }

  saveData(false);

  // Update live table badges if present
  const d1ModeEl = document.getElementById(`reading-d1-mode-${studentId}`);
  if (d1ModeEl) d1ModeEl.innerHTML = getScoreBadge(s.item1);

  const d2ModeEl = document.getElementById(`reading-d2-mode-${studentId}`);
  if (d2ModeEl) d2ModeEl.innerHTML = getScoreBadge(s.item2);

  const d3ModeEl = document.getElementById(`reading-d3-mode-${studentId}`);
  if (d3ModeEl) d3ModeEl.innerHTML = getScoreBadge(s.item3);

  const summaryEl = document.getElementById(`reading-summary-${studentId}`);
  if (summaryEl) summaryEl.innerHTML = getScoreBadge(s.summary);

  updateDashboardKpis();
}

function setBatchScoresForReading(score) {
  const students = getStudentsForActiveGrade();
  const label = score === 3 ? 'ดีเยี่ยม (3)' : (score === 2 ? 'ดี (2)' : score);
  if (confirm(`คุณต้องการกำหนดคะแนนการอ่าน คิดวิเคราะห์ และเขียนสื่อความ เป็นระดับ "${label}" ให้กับนักเรียนทั้งหมด (${students.length} คน) ใช่หรือไม่?`)) {
    students.forEach(st => {
      state.readingAssessments[st.id] = {
        item1: score,
        item2: score,
        item3: score,
        summary: score,
        readingItems: [score, score, score, score, score],
        thinkingItems: [score, score, score, score, score],
        writingItems: [score, score, score, score, score],
        term1: { reading: score, thinking: score, writing: score, summary: score },
        term2: { reading: score, thinking: score, writing: score, summary: score }
      };
    });

    saveData(true);
    renderReadingTable();
    showToast(`กำหนดคะแนนระดับ ${label} เรียบร้อยแล้ว`, 'success');
  }
}

/* ==========================================================================
   Detailed Reading Evaluation Modal (15 Indicators)
   ========================================================================== */
function openReadingDetailModal(studentId) {
  const modal = document.getElementById('reading-detail-modal');
  const st = state.students.find(s => s.id === studentId);
  if (!modal || !st) return;

  const idInput = document.getElementById('modal-reading-student-id');
  const nameEl = document.getElementById('modal-reading-student-name');
  const metaEl = document.getElementById('modal-reading-student-meta');
  const liveModeEl = document.getElementById('modal-reading-live-mode');

  idInput.value = studentId;
  nameEl.textContent = `ชื่อนักเรียน: ${st.prefix}${st.firstName} ${st.lastName}`;
  metaEl.textContent = `รหัสประจำตัว: ${st.studentCode} • ระดับชั้น: ${st.gradeLevel || 'ประถมศึกษาปีที่ 1'}`;

  const scores = getStudentReadingScores(studentId);
  if (liveModeEl) {
    const lvl = EVALUATION_META.scoreLevels[scores.summary] || EVALUATION_META.scoreLevels[3];
    liveModeEl.textContent = `${lvl.label} (${scores.summary})`;
  }

  // Render 3 Domains with 5 Indicators each into container
  const container = document.getElementById('modal-reading-items-container');
  if (container && typeof READING_ASSESSMENT_CRITERIA !== 'undefined') {
    container.innerHTML = READING_ASSESSMENT_CRITERIA.domains.map(domain => {
      const itemsArr = domain.id === 'reading' ? (scores.readingItems || [3, 3, 3, 3, 3]) : (domain.id === 'thinking' ? (scores.thinkingItems || [3, 3, 3, 3, 3]) : (scores.writingItems || [3, 3, 3, 3, 3]));
      const domScore = domain.id === 'reading' ? (scores.item1 ?? 3) : (domain.id === 'thinking' ? (scores.item2 ?? 3) : (scores.item3 ?? 3));
      const domMode = domScore ?? calculateMode(itemsArr);

      return `
        <div class="criteria-card" style="margin-bottom: 1.25rem; border-left-color: #2563eb;">
          <div class="criteria-card-title" style="color: var(--primary-blue-dark); display: flex; justify-content: space-between; align-items: center;">
            <div><i class="fa-solid fa-book-open" style="color: var(--primary-blue);"></i> ด้านที่ ${domain.number} ${domain.name} (5 ตัวชี้วัด)</div>
            <span class="badge-score score-${domMode}" id="modal-reading-dom-mode-${domain.id}" style="font-size: 0.78rem;">ฐานนิยม: ${domMode}</span>
          </div>
          <div style="margin-top: 0.5rem;">
            ${domain.indicators.map((ind, indIdx) => {
              const currentVal = itemsArr[indIdx] !== undefined ? itemsArr[indIdx] : 3;
              return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.45rem 0; border-bottom: 1px dashed var(--border-subtle); font-size: 0.86rem; gap: 1rem;">
                  <div style="flex: 1; line-height: 1.4;">
                    <strong style="color: var(--primary-blue-dark);">${ind.num}</strong> ${ind.text}
                  </div>
                  <div style="flex-shrink: 0;">
                    <select class="score-select modal-reading-select" data-domain="${domain.id}" data-index="${indIdx}" onchange="updateLiveReadingModalMode()" style="padding: 0.2rem 0.4rem; font-weight: 600;">
                      <option value="3" ${currentVal === 3 ? 'selected' : ''}>ดีเยี่ยม (3)</option>
                      <option value="2" ${currentVal === 2 ? 'selected' : ''}>ดี (2)</option>
                      <option value="1" ${currentVal === 1 ? 'selected' : ''}>ผ่าน (1)</option>
                      <option value="0" ${currentVal === 0 ? 'selected' : ''}>ไม่ผ่าน (0)</option>
                    </select>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  modal.classList.add('open');
}

function closeReadingDetailModal() {
  const modal = document.getElementById('reading-detail-modal');
  if (modal) modal.classList.remove('open');
}

function updateLiveReadingModalMode() {
  const selects = document.querySelectorAll('.modal-reading-select');
  const domMap = {};

  selects.forEach(s => {
    const dom = s.getAttribute('data-domain');
    if (!domMap[dom]) domMap[dom] = [];
    domMap[dom].push(parseInt(s.value, 10));
  });

  const domModes = [];
  ['reading', 'thinking', 'writing'].forEach(domKey => {
    if (domMap[domKey]) {
      const dMode = calculateMode(domMap[domKey]);
      domModes.push(dMode);
      const badgeEl = document.getElementById(`modal-reading-dom-mode-${domKey}`);
      if (badgeEl) badgeEl.textContent = `ฐานนิยม: ${dMode}`;
    }
  });

  const overallMode = calculateMode(domModes.length > 0 ? domModes : [3]);
  const liveModeEl = document.getElementById('modal-reading-live-mode');
  if (liveModeEl) {
    const lvl = EVALUATION_META.scoreLevels[overallMode] || EVALUATION_META.scoreLevels[3];
    liveModeEl.textContent = `${lvl.label} (${overallMode})`;
  }
}

function setModalReadingAllScores(val) {
  const selects = document.querySelectorAll('.modal-reading-select');
  selects.forEach(s => s.value = val);
  updateLiveReadingModalMode();
}

function saveReadingDetailModal(event) {
  event.preventDefault();
  const studentId = parseInt(document.getElementById('modal-reading-student-id').value, 10);
  const s = getStudentReadingScores(studentId);

  const rSelects = document.querySelectorAll('.modal-reading-select[data-domain="reading"]');
  const tSelects = document.querySelectorAll('.modal-reading-select[data-domain="thinking"]');
  const wSelects = document.querySelectorAll('.modal-reading-select[data-domain="writing"]');

  s.readingItems = Array.from(rSelects).map(sel => parseInt(sel.value, 10));
  s.thinkingItems = Array.from(tSelects).map(sel => parseInt(sel.value, 10));
  s.writingItems = Array.from(wSelects).map(sel => parseInt(sel.value, 10));

  s.item1 = calculateMode(s.readingItems);
  s.item2 = calculateMode(s.thinkingItems);
  s.item3 = calculateMode(s.writingItems);
  s.summary = calculateMode([s.item1, s.item2, s.item3]);

  if (s.term1) {
    s.term1.reading = s.item1;
    s.term1.thinking = s.item2;
    s.term1.writing = s.item3;
    s.term1.summary = s.summary;
  }

  closeReadingDetailModal();
  saveData(false);
  renderReadingTable();
  updateDashboardKpis();
  showToast('บันทึกผลการประเมิน 15 ตัวชี้วัดรายบุคคลเรียบร้อยแล้ว', 'success');
}

/* ==========================================================================
   Print Official Reading Assessment Document (ตรงตาม docx)
   ========================================================================== */
function printReadingOfficialDoc() {
  const s = state.schoolInfo || {};
  const currentGrade = s.gradeLevel || 'ประถมศึกษาปีที่ 1';
  const students = getStudentsForActiveGrade();

  // Populate Header Texts
  setValText('print-school-name', s.schoolName || 'โรงเรียนบ้านสันดาบ');
  setValText('print-area-zone', s.areaZone || 'สังกัดสำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร');
  setValText('print-grade-level', currentGrade === 'ทั้งหมด' ? 'ประถมศึกษาปีที่ 1' : currentGrade);
  setValText('print-semester', s.semester || '1');
  setValText('print-academic-year', s.academicYear || '2569');
  setValText('print-director-name', s.directorName || 'นายกฤษฎา ผลพล');

  // Find class teacher for this grade
    // Find class teachers for this grade (all teachers)
  const teachers = getGradeTeachers(currentGrade);
  const teacherNames = formatTeachersNames(teachers, ' และ ');
  setValText('print-teacher-name', teacherNames);
  const printReadingTeacherHeader = document.getElementById('print-reading-teacher-header');
  if (printReadingTeacherHeader) printReadingTeacherHeader.textContent = teacherNames;
  const readingSigContainer = document.getElementById('print-reading-signatures');
  if (readingSigContainer) {
    readingSigContainer.innerHTML = buildOfficialSignaturesHtml(currentGrade, s.directorName);
  }

  // Generate Table Rows
  const tableEl = document.getElementById('print-reading-table');
  if (tableEl) {
    tableEl.innerHTML = `
      <thead>
        <tr>
          <th rowspan="2" style="width: 45px;">เลขที่</th>
          <th rowspan="2" style="width: 80px;">รหัส</th>
          <th rowspan="2" style="width: 180px;">ชื่อ - สกุล</th>
          <th colspan="3">การอ่าน คิดวิเคราะห์ และเขียนสื่อความ</th>
          <th rowspan="2" style="width: 100px;">สรุปผล (Mode)</th>
          <th rowspan="2" style="width: 85px;">ระดับคุณภาพ</th>
        </tr>
        <tr>
          <th style="width: 90px;">1. การอ่าน</th>
          <th style="width: 90px;">2. คิดวิเคราะห์</th>
          <th style="width: 90px;">3. เขียนสื่อความ</th>
        </tr>
      </thead>
      <tbody>
        ${students.map((st, idx) => {
          const sc = getStudentReadingScores(st.id);
          const lvl = EVALUATION_META.scoreLevels[sc.summary] || EVALUATION_META.scoreLevels[3];
          return `
            <tr>
              <td>${idx + 1}</td>
              <td style="font-family: monospace;">${st.studentCode}</td>
              <td class="text-left">${st.prefix}${st.firstName} ${st.lastName}</td>
              <td>${sc.item1}</td>
              <td>${sc.item2}</td>
              <td>${sc.item3}</td>
              <td><strong>${sc.summary}</strong></td>
              <td>${lvl.label}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    `;
  }

  document.body.className = 'printing-reading';
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('printing-reading');
  }, { once: true });
  setTimeout(() => {
    document.body.classList.remove('printing-reading');
  }, 2000);
  window.print();
}

function setValText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ==========================================================================
   7. แบบประเมินคุณลักษณะอันพึงประสงค์ (8 ด้าน 80 พฤติกรรม)
   (อ้างอิงเอกสารทางการ: ป1 ผลการประเมินคุณลักษณะอันพึ่งประสงค์.docx)
   ========================================================================== */
function toggleCharacteristicsCriteriaPanel() {
  const panel = document.getElementById('characteristics-criteria-panel');
  if (panel) panel.classList.toggle('open');
}

let currentCharacteristicsSubView = 'summary';

function switchCharacteristicsSubView(subView) {
  currentCharacteristicsSubView = subView;

  // Update subnav active button
  const buttons = document.querySelectorAll('#tab-characteristics .eval-subnav-btn');
  buttons.forEach(btn => {
    if (btn.id === `btn-subview-char-${subView.replace('c', '')}` || 
        (subView === 'summary' && btn.id === 'btn-subview-char-summary') || 
        (subView === 'terms' && btn.id === 'btn-subview-char-terms')) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update table title
  const titleEl = document.getElementById('characteristics-view-title');
  if (titleEl) {
    if (subView === 'summary') {
      titleEl.textContent = 'ตารางสรุปผลการประเมินคุณลักษณะอันพึงประสงค์ (8 ด้าน)';
    } else if (subView === 'terms') {
      titleEl.textContent = 'ตารางสรุปผลการประเมินคุณลักษณะอันพึงประสงค์ เปรียบเทียบ 2 ภาคเรียน (ภ.1 / ภ.2)';
    } else {
      const dIndex = parseInt(subView.replace('c', ''), 10);
      const d = typeof CHARACTERISTICS_ASSESSMENT_CRITERIA !== 'undefined' ? CHARACTERISTICS_ASSESSMENT_CRITERIA.domains.find(item => item.number === dIndex) : null;
      titleEl.textContent = d ? `แบบประเมินรายตัวบ่งชี้: ข้อที่ ${d.number} ${d.name} (10 พฤติกรรมบ่งชี้)` : 'แบบประเมินรายตัวบ่งชี้';
    }
  }

  renderCharacteristicsTable();
}

function getStudentCharacteristicsScores(studentId) {
  if (!state.characteristicsAssessments) state.characteristicsAssessments = {};
  if (!state.characteristicsAssessments[studentId]) {
    state.characteristicsAssessments[studentId] = {
      c1: 0, c2: 0, c3: 0, c4: 0, c5: 0, c6: 0, c7: 0, c8: 0,
      summary: 0,
      detailItems: {
        c1: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        c2: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        c3: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        c4: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        c5: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        c6: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        c7: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        c8: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      },
      term1: { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0, c6: 0, c7: 0, c8: 0, summary: 0 },
      term2: { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0, c6: 0, c7: 0, c8: 0, summary: 0 }
    };
  }
  const s = state.characteristicsAssessments[studentId];
  if (!s.detailItems) {
    const tenArr = (val) => [val, val, val, val, val, val, val, val, val, val];
    s.detailItems = {
      c1: tenArr(s.c1 ?? 0),
      c2: tenArr(s.c2 ?? 0),
      c3: tenArr(s.c3 ?? 0),
      c4: tenArr(s.c4 ?? 0),
      c5: tenArr(s.c5 ?? 0),
      c6: tenArr(s.c6 ?? 0),
      c7: tenArr(s.c7 ?? 0),
      c8: tenArr(s.c8 ?? 0)
    };
  }
  return s;
}

function renderCharacteristicsTable() {
  const thead = document.getElementById('characteristics-table-header') || document.querySelector('#characteristics-table thead');
  const tbody = document.getElementById('characteristics-table-body');
  if (!tbody) return;

  const students = getStudentsForActiveGrade();
  const currentGrade = state.schoolInfo.gradeLevel || 'ประถมศึกษาปีที่ 1';
  const gradeLabel = currentGrade === 'ทั้งหมด' ? 'ทุกระดับชั้น' : (currentGrade.startsWith('ชั้น') ? currentGrade : `ชั้น${currentGrade}`);

  if (students.length === 0) {
    if (thead) thead.innerHTML = `<tr><th>เลขที่</th><th>ชั้น</th><th>รหัส</th><th>ชื่อ - นามสกุล</th><th>ผลสรุป</th></tr>`;
    tbody.innerHTML = `<tr><td colspan="14" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">ไม่พบข้อมูลนักเรียนใน ${gradeLabel}</td></tr>`;
    return;
  }

  // 1. SUB-VIEW: SUMMARY 8 DOMAINS
  if (currentCharacteristicsSubView === 'summary') {
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th style="width: 45px; text-align: center;">เลขที่</th>
          <th style="width: 70px; text-align: center;">ชั้น</th>
          <th style="width: 90px;">รหัส</th>
          <th>ชื่อ - นามสกุล</th>
          <th style="width: 40px; text-align: center;" title="1. รักชาติ ศาสน์ กษัตริย์">1</th>
          <th style="width: 40px; text-align: center;" title="2. ซื่อสัตย์สุจริต">2</th>
          <th style="width: 40px; text-align: center;" title="3. มีวินัย">3</th>
          <th style="width: 40px; text-align: center;" title="4. ใฝ่เรียนรู้">4</th>
          <th style="width: 40px; text-align: center;" title="5. อยู่อย่างพอเพียง">5</th>
          <th style="width: 40px; text-align: center;" title="6. มุ่งมั่นในการทำงาน">6</th>
          <th style="width: 40px; text-align: center;" title="7. รักความเป็นไทย">7</th>
          <th style="width: 40px; text-align: center;" title="8. มีจิตสาธารณะ">8</th>
          <th style="width: 105px; text-align: center;">ผลสรุป</th>
          <th style="width: 85px; text-align: center;">ประเมิน</th>
        </tr>
      `;
    }

    tbody.innerHTML = students.map((st, idx) => {
      const stNum = (st.studentNumber && String(st.studentNumber).trim() !== '' && String(st.studentNumber).trim() !== '-') ? st.studentNumber : (idx + 1);
      const shortGrade = formatShortGrade(st.gradeLevel || state.schoolInfo.gradeLevel || 'ป.1');
      const s = getStudentCharacteristicsScores(st.id);
      return `
        <tr>
          <td style="text-align: center; font-weight: 600;">${stNum}</td>
          <td style="text-align: center;">
            <span class="badge-score" style="background: #e0f2fe; color: #0284c7; font-weight: 700; font-size: 0.8rem; padding: 0.2rem 0.55rem; border: 1px solid #bae6fd; border-radius: 6px;">
              ${shortGrade}
            </span>
          </td>
          <td style="font-family: monospace; font-weight: 600; color: var(--primary-blue);">${st.studentCode || '-'}</td>
          <td><strong>${st.prefix || ''}${st.firstName || ''} ${st.lastName || ''}</strong></td>
          <td style="text-align: center;">${renderCharacteristicsScoreSelect(st.id, 'c1', s.c1)}</td>
          <td style="text-align: center;">${renderCharacteristicsScoreSelect(st.id, 'c2', s.c2)}</td>
          <td style="text-align: center;">${renderCharacteristicsScoreSelect(st.id, 'c3', s.c3)}</td>
          <td style="text-align: center;">${renderCharacteristicsScoreSelect(st.id, 'c4', s.c4)}</td>
          <td style="text-align: center;">${renderCharacteristicsScoreSelect(st.id, 'c5', s.c5)}</td>
          <td style="text-align: center;">${renderCharacteristicsScoreSelect(st.id, 'c6', s.c6)}</td>
          <td style="text-align: center;">${renderCharacteristicsScoreSelect(st.id, 'c7', s.c7)}</td>
          <td style="text-align: center;">${renderCharacteristicsScoreSelect(st.id, 'c8', s.c8)}</td>
          <td style="text-align: center;" id="characteristics-summary-${st.id}">${getScoreBadge(s.summary)}</td>
          <td style="text-align: center;">
            <button type="button" class="btn btn-outline btn-sm" onclick="openCharacteristicsDetailModal(${st.id})" title="ประเมินละเอียด 80 พฤติกรรมบ่งชี้" style="padding: 0.2rem 0.45rem; font-size: 0.75rem;">
              <i class="fa-solid fa-list-check text-warning"></i> 80 ข้อ
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }
  // 2. SUB-VIEW: INDIVIDUAL DOMAIN (c1 - c8: 10 behavioral indicators)
  else if (currentCharacteristicsSubView.startsWith('c')) {
    const domKey = currentCharacteristicsSubView; // 'c1'..'c8'
    const domNum = parseInt(domKey.replace('c', ''), 10);
    const domainObj = typeof CHARACTERISTICS_ASSESSMENT_CRITERIA !== 'undefined' ? CHARACTERISTICS_ASSESSMENT_CRITERIA.domains.find(d => d.number === domNum) : null;
    const indicators = domainObj ? domainObj.indicators : [];

    thead.innerHTML = `
      <tr>
        <th rowspan="2" style="width: 45px; text-align: center; vertical-align: middle;">เลขที่</th>
        <th rowspan="2" style="width: 65px; text-align: center; vertical-align: middle;">ชั้น</th>
        <th rowspan="2" style="width: 80px; vertical-align: middle;">รหัส</th>
        <th rowspan="2" style="min-width: 160px; vertical-align: middle;">ชื่อ - นามสกุล</th>
        <th colspan="10" style="text-align: center; background: #fef3c7; color: #92400e; border-bottom: 1px solid var(--border-subtle);">
          ${domainObj ? domainObj.name : domKey} (10 พฤติกรรมบ่งชี้)
        </th>
        <th rowspan="2" style="width: 105px; text-align: center; vertical-align: middle;">สรุปข้อ ${domNum} (Mode)</th>
      </tr>
      <tr>
        ${indicators.map(ind => `<th style="text-align: center; font-size: 0.74rem; width: 44px;" title="${ind.text}">${ind.num}</th>`).join('')}
      </tr>
    `;

    tbody.innerHTML = students.map((st, idx) => {
      const stNum = (st.studentNumber && String(st.studentNumber).trim() !== '' && String(st.studentNumber).trim() !== '-') ? st.studentNumber : (idx + 1);
      const shortGrade = formatShortGrade(st.gradeLevel || state.schoolInfo.gradeLevel || 'ป.1');
      const s = getStudentCharacteristicsScores(st.id);
      const items = s.detailItems[domKey] || [3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
      const domScore = s[domKey] ?? calculateMode(items);

      return `
        <tr>
          <td style="text-align: center; font-weight: 600;">${stNum}</td>
          <td style="text-align: center;">
            <span class="badge-score" style="background: #e0f2fe; color: #0284c7; font-weight: 700; font-size: 0.8rem; padding: 0.2rem 0.55rem; border: 1px solid #bae6fd; border-radius: 6px;">
              ${shortGrade}
            </span>
          </td>
          <td style="font-family: monospace; font-weight: 600; color: var(--primary-blue);">${st.studentCode || '-'}</td>
          <td><strong>${st.prefix || ''}${st.firstName || ''} ${st.lastName || ''}</strong></td>
          ${items.map((val, indIdx) => `
            <td style="text-align: center;">
              ${renderCharacteristicsDetailSelect(st.id, domKey, indIdx, val)}
            </td>
          `).join('')}
          <td style="text-align: center;" id="characteristics-dom-mode-${st.id}-${domKey}">${getScoreBadge(domScore)}</td>
        </tr>
      `;
    }).join('');
  }
  // 3. SUB-VIEW: 2-TERMS COMPARISON
  else if (currentCharacteristicsSubView === 'terms') {
    thead.innerHTML = `
      <tr>
        <th rowspan="2" style="width: 45px; text-align: center; vertical-align: middle;">เลขที่</th>
        <th rowspan="2" style="width: 65px; text-align: center; vertical-align: middle;">ชั้น</th>
        <th rowspan="2" style="width: 80px; vertical-align: middle;">รหัส</th>
        <th rowspan="2" style="min-width: 150px; vertical-align: middle;">ชื่อ - นามสกุล</th>
        <th colspan="3" style="text-align: center; font-size: 0.72rem;">1.รักชาติ</th>
        <th colspan="3" style="text-align: center; font-size: 0.72rem;">2.ซื่อสัตย์</th>
        <th colspan="3" style="text-align: center; font-size: 0.72rem;">3.มีวินัย</th>
        <th colspan="3" style="text-align: center; font-size: 0.72rem;">4.ใฝ่เรียนรู้</th>
        <th colspan="3" style="text-align: center; font-size: 0.72rem;">5.พอเพียง</th>
        <th colspan="3" style="text-align: center; font-size: 0.72rem;">6.มุ่งมั่น</th>
        <th colspan="3" style="text-align: center; font-size: 0.72rem;">7.รักไทย</th>
        <th colspan="3" style="text-align: center; font-size: 0.72rem;">8.จิตสาธารณะ</th>
        <th rowspan="2" style="width: 95px; text-align: center; vertical-align: middle;">สรุปทั้งปี</th>
      </tr>
      <tr>
        ${[1, 2, 3, 4, 5, 6, 7, 8].map(() => `
          <th style="text-align: center; font-size: 0.68rem; padding: 0.2rem;">ภ.1</th>
          <th style="text-align: center; font-size: 0.68rem; padding: 0.2rem;">ภ.2</th>
          <th style="text-align: center; font-size: 0.68rem; padding: 0.2rem; font-weight: 700;">สรุป</th>
        `).join('')}
      </tr>
    `;

    tbody.innerHTML = students.map((st, idx) => {
      const stNum = (st.studentNumber && String(st.studentNumber).trim() !== '' && String(st.studentNumber).trim() !== '-') ? st.studentNumber : (idx + 1);
      const shortGrade = formatShortGrade(st.gradeLevel || state.schoolInfo.gradeLevel || 'ป.1');
      const s = getStudentCharacteristicsScores(st.id);
      const t1 = s.term1 || s;
      const t2 = s.term2 || s;

      return `
        <tr>
          <td style="text-align: center; font-weight: 600;">${stNum}</td>
          <td style="text-align: center;">
            <span class="badge-score" style="background: #e0f2fe; color: #0284c7; font-weight: 700; font-size: 0.8rem; padding: 0.2rem 0.55rem; border: 1px solid #bae6fd; border-radius: 6px;">
              ${shortGrade}
            </span>
          </td>
          <td style="font-family: monospace; font-weight: 600; color: var(--primary-blue);">${st.studentCode || '-'}</td>
          <td><strong>${st.prefix || ''}${st.firstName || ''} ${st.lastName || ''}</strong></td>
          ${[1, 2, 3, 4, 5, 6, 7, 8].map(i => {
            const k = `c${i}`;
            return `
              <td style="text-align: center; font-size: 0.78rem;">${t1[k] ?? 3}</td>
              <td style="text-align: center; font-size: 0.78rem;">${t2[k] ?? 3}</td>
              <td style="text-align: center; font-weight: 700; font-size: 0.78rem;">${s[k] ?? 3}</td>
            `;
          }).join('')}
          <td style="text-align: center;">${getScoreBadge(s.summary)}</td>
        </tr>
      `;
    }).join('');
  }
}

function renderCharacteristicsScoreSelect(studentId, field, currentVal) {
  const val = Number(currentVal !== undefined ? currentVal : 0);
  return `
    <select class="score-select" onchange="updateCharacteristicsScore(${studentId}, '${field}', this.value)" style="padding: 0.15rem 0.35rem; font-size: 0.8rem; font-weight: 600;">
      <option value="3" ${val === 3 ? 'selected' : ''}>3 (ดีเยี่ยม)</option>
      <option value="2" ${val === 2 ? 'selected' : ''}>2 (ดี)</option>
      <option value="1" ${val === 1 ? 'selected' : ''}>1 (ผ่าน)</option>
      <option value="0" ${val === 0 ? 'selected' : ''}>0 (ไม่ผ่าน)</option>
    </select>
  `;
}

function renderCharacteristicsDetailSelect(studentId, domKey, index, currentVal) {
  const val = Number(currentVal !== undefined ? currentVal : 0);
  return `
    <select class="score-select" onchange="updateCharacteristicsDetailIndicatorScore(${studentId}, '${domKey}', ${index}, this.value)" style="padding: 0.12rem 0.25rem; font-size: 0.75rem; font-weight: 600; min-width: 44px;">
      <option value="3" ${val === 3 ? 'selected' : ''}>3 (ดีเยี่ยม)</option>
      <option value="2" ${val === 2 ? 'selected' : ''}>2 (ดี)</option>
      <option value="1" ${val === 1 ? 'selected' : ''}>1 (ผ่าน)</option>
      <option value="0" ${val === 0 ? 'selected' : ''}>0 (ไม่ผ่าน)</option>
    </select>
  `;
}

function updateCharacteristicsScore(studentId, field, value) {
  const numVal = parseInt(value, 10);
  const s = getStudentCharacteristicsScores(studentId);
  s[field] = numVal;
  if (s.detailItems && s.detailItems[field]) {
    s.detailItems[field] = [numVal, numVal, numVal, numVal, numVal, numVal, numVal, numVal, numVal, numVal];
  }
  s.summary = calculateMode([s.c1, s.c2, s.c3, s.c4, s.c5, s.c6, s.c7, s.c8]);
  if (s.term1) {
    s.term1[field] = numVal;
    s.term1.summary = s.summary;
  }
  saveData(false);

  const summaryEl = document.getElementById(`characteristics-summary-${studentId}`);
  if (summaryEl) summaryEl.innerHTML = getScoreBadge(s.summary);

  updateDashboardKpis();
}

function updateCharacteristicsDetailIndicatorScore(studentId, domKey, index, value) {
  const numVal = parseInt(value, 10);
  const s = getStudentCharacteristicsScores(studentId);
  if (!s.detailItems[domKey]) s.detailItems[domKey] = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
  s.detailItems[domKey][index] = numVal;

  s[domKey] = calculateMode(s.detailItems[domKey]);
  s.summary = calculateMode([s.c1, s.c2, s.c3, s.c4, s.c5, s.c6, s.c7, s.c8]);

  if (s.term1) {
    s.term1[domKey] = s[domKey];
    s.term1.summary = s.summary;
  }

  saveData(false);

  const domModeEl = document.getElementById(`characteristics-dom-mode-${studentId}-${domKey}`);
  if (domModeEl) domModeEl.innerHTML = getScoreBadge(s[domKey]);

  updateDashboardKpis();
}

function setBatchScoresForCharacteristics(score) {
  const students = getStudentsForActiveGrade();
  const label = score === 3 ? 'ดีเยี่ยม (3)' : (score === 2 ? 'ดี (2)' : score);
  if (confirm(`คุณต้องการกำหนดคะแนนคุณลักษณะอันพึงประสงค์ (8 ด้าน 80 ข้อ) เป็นระดับ "${label}" ให้กับนักเรียนทั้งหมด (${students.length} คน) ใช่หรือไม่?`)) {
    const tenArr = () => [score, score, score, score, score, score, score, score, score, score];
    students.forEach(st => {
      state.characteristicsAssessments[st.id] = {
        c1: score, c2: score, c3: score, c4: score, c5: score, c6: score, c7: score, c8: score,
        summary: score,
        detailItems: {
          c1: tenArr(), c2: tenArr(), c3: tenArr(), c4: tenArr(),
          c5: tenArr(), c6: tenArr(), c7: tenArr(), c8: tenArr()
        },
        term1: { c1: score, c2: score, c3: score, c4: score, c5: score, c6: score, c7: score, c8: score, summary: score },
        term2: { c1: score, c2: score, c3: score, c4: score, c5: score, c6: score, c7: score, c8: score, summary: score }
      };
    });

    saveData(true);
    renderCharacteristicsTable();
    showToast(`กำหนดคะแนนคุณลักษณะอันพึงประสงค์ระดับ ${label} เรียบร้อยแล้ว`, 'success');
  }
}

function openCharacteristicsDetailModal(studentId) {
  const modal = document.getElementById('characteristics-detail-modal');
  const st = state.students.find(s => s.id === studentId);
  if (!modal || !st) return;

  const idInput = document.getElementById('modal-characteristics-student-id');
  const nameEl = document.getElementById('modal-characteristics-student-name');
  const metaEl = document.getElementById('modal-characteristics-student-meta');
  const liveModeEl = document.getElementById('modal-characteristics-live-mode');
  const container = document.getElementById('modal-characteristics-domains-container');

  idInput.value = studentId;
  nameEl.textContent = `ชื่อนักเรียน: ${st.prefix}${st.firstName} ${st.lastName}`;
  metaEl.textContent = `รหัสประจำตัว: ${st.studentCode} • ระดับชั้น: ${st.gradeLevel || 'ประถมศึกษาปีที่ 1'}`;

  const scores = getStudentCharacteristicsScores(studentId);
  if (liveModeEl) {
    const lvl = EVALUATION_META.scoreLevels[scores.summary] || EVALUATION_META.scoreLevels[3];
    liveModeEl.textContent = `${lvl.label} (${scores.summary})`;
  }

  if (container && typeof CHARACTERISTICS_ASSESSMENT_CRITERIA !== 'undefined') {
    container.innerHTML = CHARACTERISTICS_ASSESSMENT_CRITERIA.domains.map(dom => {
      const domKey = dom.id; // 'c1'..'c8'
      const items = scores.detailItems[domKey] || [3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
      const domMode = scores[domKey] ?? calculateMode(items);

      return `
        <div class="criteria-card" style="margin-bottom: 1.25rem; border-left-color: #f59e0b;">
          <div class="criteria-card-title" style="color: #b45309; display: flex; justify-content: space-between; align-items: center;">
            <div><i class="fa-solid fa-star" style="color: #f59e0b;"></i> ข้อที่ ${dom.number} ${dom.name}</div>
            <span class="badge-score score-${domMode}" id="modal-char-dom-mode-${domKey}" style="font-size: 0.78rem;">ฐานนิยม: ${domMode}</span>
          </div>
          <div style="margin-top: 0.5rem;">
            ${dom.indicators.map((ind, indIdx) => {
              const currentVal = items[indIdx] !== undefined ? items[indIdx] : 3;
              return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0; border-bottom: 1px dashed var(--border-subtle); font-size: 0.85rem; gap: 0.75rem;">
                  <div style="flex: 1; line-height: 1.35;">
                    <strong style="color: #b45309;">${ind.num}</strong> ${ind.text}
                  </div>
                  <div style="flex-shrink: 0;">
                    <select class="score-select modal-char-select" data-domain="${domKey}" data-index="${indIdx}" onchange="updateLiveCharacteristicsModalMode()" style="padding: 0.2rem 0.4rem; font-weight: 600;">
                      <option value="3" ${currentVal === 3 ? 'selected' : ''}>3 (ดีเยี่ยม)</option>
                      <option value="2" ${currentVal === 2 ? 'selected' : ''}>2 (ดี)</option>
                      <option value="1" ${currentVal === 1 ? 'selected' : ''}>1 (ผ่าน)</option>
                      <option value="0" ${currentVal === 0 ? 'selected' : ''}>0 (ไม่ผ่าน)</option>
                    </select>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  modal.classList.add('open');
}

function closeCharacteristicsDetailModal() {
  const modal = document.getElementById('characteristics-detail-modal');
  if (modal) modal.classList.remove('open');
}

function updateLiveCharacteristicsModalMode() {
  const selects = document.querySelectorAll('.modal-char-select');
  const domMap = {};

  selects.forEach(s => {
    const dom = s.getAttribute('data-domain');
    if (!domMap[dom]) domMap[dom] = [];
    domMap[dom].push(parseInt(s.value, 10));
  });

  const domModes = [];
  Object.keys(domMap).forEach(domKey => {
    const dMode = calculateMode(domMap[domKey]);
    domModes.push(dMode);
    const badgeEl = document.getElementById(`modal-char-dom-mode-${domKey}`);
    if (badgeEl) badgeEl.textContent = `ฐานนิยม: ${dMode}`;
  });

  const overallMode = calculateMode(domModes);
  const liveModeEl = document.getElementById('modal-characteristics-live-mode');
  if (liveModeEl) {
    const lvl = EVALUATION_META.scoreLevels[overallMode] || EVALUATION_META.scoreLevels[3];
    liveModeEl.textContent = `${lvl.label} (${overallMode})`;
  }
}

function setModalCharacteristicsAllScores(val) {
  const selects = document.querySelectorAll('.modal-char-select');
  selects.forEach(s => s.value = val);
  updateLiveCharacteristicsModalMode();
}

function saveCharacteristicsDetailModal(event) {
  event.preventDefault();
  const studentId = parseInt(document.getElementById('modal-characteristics-student-id').value, 10);
  const s = getStudentCharacteristicsScores(studentId);

  const domModes = [];
  ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'].forEach(domKey => {
    const selects = document.querySelectorAll(`.modal-char-select[data-domain="${domKey}"]`);
    s.detailItems[domKey] = Array.from(selects).map(sel => parseInt(sel.value, 10));
    s[domKey] = calculateMode(s.detailItems[domKey]);
    domModes.push(s[domKey]);
    if (s.term1) s.term1[domKey] = s[domKey];
  });

  s.summary = calculateMode(domModes);
  if (s.term1) s.term1.summary = s.summary;

  closeCharacteristicsDetailModal();
  saveData(false);
  renderCharacteristicsTable();
  updateDashboardKpis();
  showToast('บันทึกผลการประเมินคุณลักษณะอันพึงประสงค์ 80 พฤติกรรมเรียบร้อยแล้ว', 'success');
}

function printCharacteristicsOfficialDoc() {
  const s = state.schoolInfo || {};
  const currentGrade = s.gradeLevel || 'ประถมศึกษาปีที่ 1';
  const students = getStudentsForActiveGrade();

  setValText('print-char-school-name', s.schoolName || 'โรงเรียนบ้านสันดาบ');
  setValText('print-char-area-zone', s.areaZone || 'สังกัดสำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร');
  setValText('print-char-grade-level', currentGrade === 'ทั้งหมด' ? 'ประถมศึกษาปีที่ 1' : currentGrade);
  setValText('print-char-semester', s.semester || '1');
  setValText('print-char-academic-year', s.academicYear || '2569');
  setValText('print-char-director-name', s.directorName || 'นายกฤษฎา ผลพล');

    // Find class teachers for this grade (all teachers)
  const teachers = getGradeTeachers(currentGrade);
  const teacherNames = formatTeachersNames(teachers, ' และ ');
  setValText('print-char-teacher-name', teacherNames);
  const printCharTeacherHeader = document.getElementById('print-char-teacher-header');
  if (printCharTeacherHeader) printCharTeacherHeader.textContent = teacherNames;
  const charSigContainer = document.getElementById('print-characteristics-signatures');
  if (charSigContainer) {
    charSigContainer.innerHTML = buildOfficialSignaturesHtml(currentGrade, s.directorName);
  }

  const tableEl = document.getElementById('print-characteristics-table');
  if (tableEl) {
    tableEl.innerHTML = `
      <thead>
        <tr>
          <th rowspan="2" style="width: 40px;">เลขที่</th>
          <th rowspan="2" style="width: 75px;">รหัส</th>
          <th rowspan="2" style="width: 170px;">ชื่อ - สกุล</th>
          <th colspan="8">คุณลักษณะอันพึงประสงค์ (8 ประการ)</th>
          <th rowspan="2" style="width: 80px;">สรุป (Mode)</th>
          <th rowspan="2" style="width: 80px;">ระดับคุณภาพ</th>
        </tr>
        <tr>
          <th style="font-size: 7.5pt; width: 45px;" title="1. รักชาติ ศาสน์ กษัตริย์">1.รักชาติ</th>
          <th style="font-size: 7.5pt; width: 45px;" title="2. ซื่อสัตย์สุจริต">2.ซื่อสัตย์</th>
          <th style="font-size: 7.5pt; width: 45px;" title="3. มีวินัย">3.มีวินัย</th>
          <th style="font-size: 7.5pt; width: 45px;" title="4. ใฝ่เรียนรู้">4.ใฝ่เรียน</th>
          <th style="font-size: 7.5pt; width: 45px;" title="5. อยู่อย่างพอเพียง">5.พอเพียง</th>
          <th style="font-size: 7.5pt; width: 45px;" title="6. มุ่งมั่นในการทำงาน">6.มุ่งมั่น</th>
          <th style="font-size: 7.5pt; width: 45px;" title="7. รักความเป็นไทย">7.รักไทย</th>
          <th style="font-size: 7.5pt; width: 45px;" title="8. มีจิตสาธารณะ">8.จิตสาธารณะ</th>
        </tr>
      </thead>
      <tbody>
        ${students.map((st, idx) => {
          const sc = getStudentCharacteristicsScores(st.id);
          const lvl = EVALUATION_META.scoreLevels[sc.summary] || EVALUATION_META.scoreLevels[0];
          return `
            <tr>
              <td>${idx + 1}</td>
              <td style="font-family: monospace;">${st.studentCode}</td>
              <td class="text-left">${st.prefix}${st.firstName} ${st.lastName}</td>
              <td>${sc.c1}</td>
              <td>${sc.c2}</td>
              <td>${sc.c3}</td>
              <td>${sc.c4}</td>
              <td>${sc.c5}</td>
              <td>${sc.c6}</td>
              <td>${sc.c7}</td>
              <td>${sc.c8}</td>
              <td><strong>${sc.summary}</strong></td>
              <td>${lvl.label}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    `;
  }

  document.body.className = 'printing-characteristics';
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('printing-characteristics');
  }, { once: true });
  setTimeout(() => {
    document.body.classList.remove('printing-characteristics');
  }, 2000);
  window.print();
}

/* ==========================================================================
   7. Competencies Assessment (5 ด้าน 25 ตัวชี้วัด)
   ========================================================================== */
function toggleCompetenciesCriteriaPanel() {
  const panel = document.getElementById('competencies-criteria-panel');
  if (panel) panel.classList.toggle('open');
}

let currentCompetenciesSubView = 'summary';

function switchCompetenciesSubView(subView) {
  currentCompetenciesSubView = subView;

  // Update subnav active button
  const buttons = document.querySelectorAll('#tab-competencies .eval-subnav-btn');
  buttons.forEach(btn => {
    if (btn.id === `btn-subview-comp-${subView.replace('k', '')}` || 
        (subView === 'summary' && btn.id === 'btn-subview-comp-summary') || 
        (subView === 'terms' && btn.id === 'btn-subview-comp-terms')) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  renderCompetenciesTable();
}

function getStudentCompetenciesScores(studentId) {
  if (!state.competenciesAssessments) state.competenciesAssessments = {};
  if (!state.competenciesAssessments[studentId]) {
    state.competenciesAssessments[studentId] = {
      k1: 0, k2: 0, k3: 0, k4: 0, k5: 0,
      summary: 0,
      detailItems: {
        k1: [0, 0, 0, 0, 0],
        k2: [0, 0, 0, 0, 0],
        k3: [0, 0, 0, 0, 0],
        k4: [0, 0, 0, 0, 0],
        k5: [0, 0, 0, 0, 0]
      },
      term1: { k1: 0, k2: 0, k3: 0, k4: 0, k5: 0, summary: 0 },
      term2: { k1: 0, k2: 0, k3: 0, k4: 0, k5: 0, summary: 0 }
    };
  }
  const s = state.competenciesAssessments[studentId];
  if (!s.detailItems) {
    const fiveArr = (val) => [val, val, val, val, val];
    s.detailItems = {
      k1: fiveArr(s.k1 ?? 0),
      k2: fiveArr(s.k2 ?? 0),
      k3: fiveArr(s.k3 ?? 0),
      k4: fiveArr(s.k4 ?? 0),
      k5: fiveArr(s.k5 ?? 0)
    };
  }
  return s;
}

function renderCompetenciesTable() {
  const thead = document.getElementById('competencies-table-header') || document.querySelector('#competencies-table thead');
  const tbody = document.getElementById('competencies-table-body');
  if (!tbody) return;

  const students = getStudentsForActiveGrade();
  const currentGrade = state.schoolInfo.gradeLevel || 'ประถมศึกษาปีที่ 1';
  const gradeLabel = currentGrade === 'ทั้งหมด' ? 'ทุกระดับชั้น' : (currentGrade.startsWith('ชั้น') ? currentGrade : `ชั้น${currentGrade}`);

  if (students.length === 0) {
    if (thead) thead.innerHTML = `<tr><th>เลขที่</th><th>ชั้น</th><th>รหัส</th><th>ชื่อ - นามสกุล</th><th>ผลสรุป</th></tr>`;
    tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">ไม่พบข้อมูลนักเรียนใน ${gradeLabel}</td></tr>`;
    return;
  }

  // 1. SUB-VIEW: SUMMARY 5 DOMAINS
  if (currentCompetenciesSubView === 'summary') {
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th style="width: 45px; text-align: center;">เลขที่</th>
          <th style="width: 70px; text-align: center;">ชั้น</th>
          <th style="width: 90px;">รหัส</th>
          <th>ชื่อ - นามสกุล</th>
          <th style="width: 55px; text-align: center;" title="1. ความสามารถในการสื่อสาร">การสื่อสาร</th>
          <th style="width: 55px; text-align: center;" title="2. ความสามารถในการคิด">การคิด</th>
          <th style="width: 55px; text-align: center;" title="3. ความสามารถในการแก้ปัญหา">แก้ปัญหา</th>
          <th style="width: 55px; text-align: center;" title="4. ความสามารถในการใช้ทักษะชีวิต">ทักษะชีวิต</th>
          <th style="width: 55px; text-align: center;" title="5. ความสามารถในการใช้เทคโนโลยี">เทคโนโลยี</th>
          <th style="width: 105px; text-align: center;">ผลสรุป</th>
          <th style="width: 85px; text-align: center;">ประเมิน</th>
        </tr>
      `;
    }

    tbody.innerHTML = students.map((st, idx) => {
      const stNum = (st.studentNumber && String(st.studentNumber).trim() !== '' && String(st.studentNumber).trim() !== '-') ? st.studentNumber : (idx + 1);
      const shortGrade = formatShortGrade(st.gradeLevel || state.schoolInfo.gradeLevel || 'ป.1');
      const s = getStudentCompetenciesScores(st.id);
      return `
        <tr>
          <td style="text-align: center; font-weight: 600;">${stNum}</td>
          <td style="text-align: center;">
            <span class="badge-score" style="background: #e0f2fe; color: #0284c7; font-weight: 700; font-size: 0.8rem; padding: 0.2rem 0.55rem; border: 1px solid #bae6fd; border-radius: 6px;">
              ${shortGrade}
            </span>
          </td>
          <td style="font-family: monospace; font-weight: 600; color: var(--primary-blue);">${st.studentCode || '-'}</td>
          <td><strong>${st.prefix || ''}${st.firstName || ''} ${st.lastName || ''}</strong></td>
          <td style="text-align: center;">${renderCompetenciesScoreSelect(st.id, 'k1', s.k1)}</td>
          <td style="text-align: center;">${renderCompetenciesScoreSelect(st.id, 'k2', s.k2)}</td>
          <td style="text-align: center;">${renderCompetenciesScoreSelect(st.id, 'k3', s.k3)}</td>
          <td style="text-align: center;">${renderCompetenciesScoreSelect(st.id, 'k4', s.k4)}</td>
          <td style="text-align: center;">${renderCompetenciesScoreSelect(st.id, 'k5', s.k5)}</td>
          <td style="text-align: center;" id="competencies-summary-${st.id}">${getScoreBadge(s.summary)}</td>
          <td style="text-align: center;">
            <button type="button" class="btn btn-outline btn-sm" onclick="openCompetenciesDetailModal(${st.id})" title="ประเมินละเอียด 25 ตัวชี้วัด" style="padding: 0.2rem 0.45rem; font-size: 0.75rem;">
              <i class="fa-solid fa-list-check text-primary"></i> 25 ข้อ
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }
  // 2. SUB-VIEW: INDIVIDUAL DOMAIN (k1 - k5: 5 indicators)
  else if (currentCompetenciesSubView.startsWith('k')) {
    const domKey = currentCompetenciesSubView; // 'k1'..'k5'
    const domNum = parseInt(domKey.replace('k', ''), 10);
    const domainObj = typeof COMPETENCIES_ASSESSMENT_CRITERIA !== 'undefined' ? COMPETENCIES_ASSESSMENT_CRITERIA.domains.find(d => d.number === domNum) : null;
    const indicators = domainObj ? domainObj.indicators : [];

    thead.innerHTML = `
      <tr>
        <th rowspan="2" style="width: 45px; text-align: center; vertical-align: middle;">เลขที่</th>
        <th rowspan="2" style="width: 65px; text-align: center; vertical-align: middle;">ชั้น</th>
        <th rowspan="2" style="width: 80px; vertical-align: middle;">รหัส</th>
        <th rowspan="2" style="min-width: 160px; vertical-align: middle;">ชื่อ - นามสกุล</th>
        <th colspan="5" style="text-align: center; background: #e0e7ff; color: #3730a3; border-bottom: 1px solid var(--border-subtle);">
          ${domainObj ? domainObj.name : domKey} (5 ตัวชี้วัด)
        </th>
        <th rowspan="2" style="width: 105px; text-align: center; vertical-align: middle;">สรุปด้าน ${domNum} (Mode)</th>
      </tr>
      <tr>
        ${indicators.map(ind => `<th style="text-align: center; font-size: 0.74rem; width: 48px;" title="${ind.text}">${ind.num}</th>`).join('')}
      </tr>
    `;

    tbody.innerHTML = students.map((st, idx) => {
      const stNum = (st.studentNumber && String(st.studentNumber).trim() !== '' && String(st.studentNumber).trim() !== '-') ? st.studentNumber : (idx + 1);
      const shortGrade = formatShortGrade(st.gradeLevel || state.schoolInfo.gradeLevel || 'ป.1');
      const s = getStudentCompetenciesScores(st.id);
      const items = s.detailItems[domKey] || [3, 3, 3, 3, 3];
      const domScore = s[domKey] ?? calculateMode(items);

      return `
        <tr>
          <td style="text-align: center; font-weight: 600;">${stNum}</td>
          <td style="text-align: center;">
            <span class="badge-score" style="background: #e0f2fe; color: #0284c7; font-weight: 700; font-size: 0.8rem; padding: 0.2rem 0.55rem; border: 1px solid #bae6fd; border-radius: 6px;">
              ${shortGrade}
            </span>
          </td>
          <td style="font-family: monospace; font-weight: 600; color: var(--primary-blue);">${st.studentCode || '-'}</td>
          <td><strong>${st.prefix || ''}${st.firstName || ''} ${st.lastName || ''}</strong></td>
          ${items.map((val, indIdx) => `
            <td style="text-align: center;">
              ${renderCompetenciesDetailSelect(st.id, domKey, indIdx, val)}
            </td>
          `).join('')}
          <td style="text-align: center;" id="competencies-dom-mode-${st.id}-${domKey}">${getScoreBadge(domScore)}</td>
        </tr>
      `;
    }).join('');
  }
  // 3. SUB-VIEW: 2-TERMS COMPARISON
  else if (currentCompetenciesSubView === 'terms') {
    thead.innerHTML = `
      <tr>
        <th rowspan="2" style="width: 45px; text-align: center; vertical-align: middle;">เลขที่</th>
        <th rowspan="2" style="width: 65px; text-align: center; vertical-align: middle;">ชั้น</th>
        <th rowspan="2" style="width: 80px; vertical-align: middle;">รหัส</th>
        <th rowspan="2" style="min-width: 150px; vertical-align: middle;">ชื่อ - นามสกุล</th>
        <th colspan="3" style="text-align: center; font-size: 0.72rem;">1.การสื่อสาร</th>
        <th colspan="3" style="text-align: center; font-size: 0.72rem;">2.การคิด</th>
        <th colspan="3" style="text-align: center; font-size: 0.72rem;">3.แก้ปัญหา</th>
        <th colspan="3" style="text-align: center; font-size: 0.72rem;">4.ทักษะชีวิต</th>
        <th colspan="3" style="text-align: center; font-size: 0.72rem;">5.เทคโนโลยี</th>
        <th rowspan="2" style="width: 95px; text-align: center; vertical-align: middle;">สรุปทั้งปี</th>
      </tr>
      <tr>
        ${[1, 2, 3, 4, 5].map(() => `
          <th style="text-align: center; font-size: 0.68rem; padding: 0.2rem;">ภ.1</th>
          <th style="text-align: center; font-size: 0.68rem; padding: 0.2rem;">ภ.2</th>
          <th style="text-align: center; font-size: 0.68rem; padding: 0.2rem; font-weight: 700;">สรุป</th>
        `).join('')}
      </tr>
    `;

    tbody.innerHTML = students.map((st, idx) => {
      const stNum = (st.studentNumber && String(st.studentNumber).trim() !== '' && String(st.studentNumber).trim() !== '-') ? st.studentNumber : (idx + 1);
      const shortGrade = formatShortGrade(st.gradeLevel || state.schoolInfo.gradeLevel || 'ป.1');
      const s = getStudentCompetenciesScores(st.id);
      const t1 = s.term1 || s;
      const t2 = s.term2 || s;

      return `
        <tr>
          <td style="text-align: center; font-weight: 600;">${stNum}</td>
          <td style="text-align: center;">
            <span class="badge-score" style="background: #e0f2fe; color: #0284c7; font-weight: 700; font-size: 0.8rem; padding: 0.2rem 0.55rem; border: 1px solid #bae6fd; border-radius: 6px;">
              ${shortGrade}
            </span>
          </td>
          <td style="font-family: monospace; font-weight: 600; color: var(--primary-blue);">${st.studentCode || '-'}</td>
          <td><strong>${st.prefix || ''}${st.firstName || ''} ${st.lastName || ''}</strong></td>
          ${[1, 2, 3, 4, 5].map(i => {
            const kKey = `k${i}`;
            const v1 = t1[kKey] ?? 0;
            const v2 = t2[kKey] ?? 0;
            const vTot = s[kKey] ?? 0;
            return `
              <td style="text-align: center; font-size: 0.78rem;">${v1}</td>
              <td style="text-align: center; font-size: 0.78rem;">${v2}</td>
              <td style="text-align: center; font-weight: 700; font-size: 0.78rem; background: #f8fafc;">${vTot}</td>
            `;
          }).join('')}
          <td style="text-align: center;" id="competencies-term-summary-${st.id}">${getScoreBadge(s.summary)}</td>
        </tr>
      `;
    }).join('');
  }
}

function renderCompetenciesScoreSelect(studentId, field, currentVal) {
  const val = Number(currentVal !== undefined ? currentVal : 0);
  return `
    <select class="score-select" onchange="updateCompetenciesScore(${studentId}, '${field}', this.value)" style="padding: 0.15rem 0.35rem; font-size: 0.8rem; font-weight: 600;">
      <option value="3" ${val === 3 ? 'selected' : ''}>3 (ดีเยี่ยม)</option>
      <option value="2" ${val === 2 ? 'selected' : ''}>2 (ดี)</option>
      <option value="1" ${val === 1 ? 'selected' : ''}>1 (ผ่าน)</option>
      <option value="0" ${val === 0 ? 'selected' : ''}>0 (ไม่ผ่าน)</option>
    </select>
  `;
}

function renderCompetenciesDetailSelect(studentId, domKey, index, currentVal) {
  const val = Number(currentVal !== undefined ? currentVal : 0);
  return `
    <select class="score-select" onchange="updateCompetenciesDetailIndicatorScore(${studentId}, '${domKey}', ${index}, this.value)" style="padding: 0.12rem 0.25rem; font-size: 0.75rem; font-weight: 600; min-width: 44px;">
      <option value="3" ${val === 3 ? 'selected' : ''}>3 (ดีเยี่ยม)</option>
      <option value="2" ${val === 2 ? 'selected' : ''}>2 (ดี)</option>
      <option value="1" ${val === 1 ? 'selected' : ''}>1 (ผ่าน)</option>
      <option value="0" ${val === 0 ? 'selected' : ''}>0 (ไม่ผ่าน)</option>
    </select>
  `;
}

function updateCompetenciesScore(studentId, field, value) {
  const s = getStudentCompetenciesScores(studentId);
  const val = parseInt(value, 10);
  s[field] = val;

  if (s.detailItems && s.detailItems[field]) {
    s.detailItems[field] = s.detailItems[field].map(() => val);
  }
  if (s.term1) s.term1[field] = val;
  if (s.term2) s.term2[field] = val;

  // Re-calculate summary Mode from 5 domains
  s.summary = calculateMode([s.k1, s.k2, s.k3, s.k4, s.k5]);
  if (s.term1) s.term1.summary = s.summary;
  if (s.term2) s.term2.summary = s.summary;

  const sumBadge = document.getElementById(`competencies-summary-${studentId}`);
  if (sumBadge) sumBadge.innerHTML = getScoreBadge(s.summary);

  saveData(false);
  updateDashboardKpis();
}

function updateCompetenciesDetailIndicatorScore(studentId, domKey, index, value) {
  const s = getStudentCompetenciesScores(studentId);
  const val = parseInt(value, 10);
  if (!s.detailItems[domKey]) s.detailItems[domKey] = [0, 0, 0, 0, 0];
  s.detailItems[domKey][index] = val;

  // Update domain score as mode of its 5 indicators
  s[domKey] = calculateMode(s.detailItems[domKey]);
  if (s.term1) s.term1[domKey] = s[domKey];

  // Update summary mode from 5 domains
  s.summary = calculateMode([s.k1, s.k2, s.k3, s.k4, s.k5]);
  if (s.term1) s.term1.summary = s.summary;

  const domModeBadge = document.getElementById(`competencies-dom-mode-${studentId}-${domKey}`);
  if (domModeBadge) domModeBadge.innerHTML = getScoreBadge(s[domKey]);

  saveData(false);
  updateDashboardKpis();
}

function setAllCompetenciesScore(score) {
  const students = getStudentsForActiveGrade();
  const label = score === 3 ? 'ดีเยี่ยม (3)' : (score === 2 ? 'ดี (2)' : (score === 1 ? 'ผ่าน (1)' : 'ไม่ผ่าน (0)'));
  const gradeLabel = state.schoolInfo.gradeLevel || 'ประถมศึกษาปีที่ 1';

  if (confirm(`คุณต้องการกำหนดผลการประเมินสมรรถนะสำคัญผู้เรียนเป็น "${label}" ให้กับนักเรียนใน${gradeLabel} (${students.length} คน) ทั้งหมดใช่หรือไม่?`)) {
    const fiveArr = () => [score, score, score, score, score];
    students.forEach(st => {
      state.competenciesAssessments[st.id] = {
        k1: score, k2: score, k3: score, k4: score, k5: score,
        summary: score,
        detailItems: {
          k1: fiveArr(), k2: fiveArr(), k3: fiveArr(), k4: fiveArr(), k5: fiveArr()
        },
        term1: { k1: score, k2: score, k3: score, k4: score, k5: score, summary: score },
        term2: { k1: score, k2: score, k3: score, k4: score, k5: score, summary: score }
      };
    });

    saveData(true);
    renderCompetenciesTable();
    showToast(`กำหนดคะแนนสมรรถนะสำคัญผู้เรียนระดับ ${label} เรียบร้อยแล้ว`, 'success');
  }
}

function setBatchScoresForCompetencies(score) {
  setAllCompetenciesScore(score);
}

function openCompetenciesDetailModal(studentId) {
  const modal = document.getElementById('competencies-detail-modal');
  const st = state.students.find(s => s.id === studentId);
  if (!modal || !st) return;

  const idInput = document.getElementById('modal-competencies-student-id');
  const nameEl = document.getElementById('modal-competencies-student-name');
  const metaEl = document.getElementById('modal-competencies-student-meta');
  const liveModeEl = document.getElementById('modal-competencies-live-mode');
  const container = document.getElementById('modal-competencies-domains-container');

  idInput.value = studentId;
  nameEl.textContent = `ชื่อนักเรียน: ${st.prefix || ''}${st.firstName || ''} ${st.lastName || ''}`;
  metaEl.textContent = `รหัสประจำตัว: ${st.studentCode || '-'} โ€ข ระดับชั้น: ${st.gradeLevel || state.schoolInfo.gradeLevel || 'ประถมศึกษาปีที่ 1'}`;

  const scores = getStudentCompetenciesScores(studentId);
  if (liveModeEl) {
    const lvl = EVALUATION_META.scoreLevels[scores.summary] || EVALUATION_META.scoreLevels[0];
    liveModeEl.textContent = `${lvl.label} (${scores.summary})`;
  }

  if (container && typeof COMPETENCIES_ASSESSMENT_CRITERIA !== 'undefined') {
    container.innerHTML = COMPETENCIES_ASSESSMENT_CRITERIA.domains.map(dom => {
      const domKey = `k${dom.number}`; // 'k1'..'k5'
      const items = scores.detailItems[domKey] || [0, 0, 0, 0, 0];
      const domMode = scores[domKey] ?? calculateMode(items);

      return `
        <div class="criteria-card" style="margin-bottom: 1.25rem; border-left-color: #6366f1;">
          <div class="criteria-card-title" style="color: #4338ca; display: flex; justify-content: space-between; align-items: center;">
            <div><i class="fa-solid fa-chart-simple" style="color: #6366f1;"></i> ด้านที่ ${dom.number} ${dom.name}</div>
            <span class="badge-score score-${domMode}" id="modal-comp-dom-mode-${domKey}" style="font-size: 0.78rem;">ฐานนิยม: ${domMode}</span>
          </div>
          <div style="margin-top: 0.5rem;">
            ${dom.indicators.map((ind, indIdx) => {
              const currentVal = items[indIdx] !== undefined ? items[indIdx] : 0;
              return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0; border-bottom: 1px dashed var(--border-subtle); font-size: 0.85rem; gap: 0.75rem;">
                  <div style="flex: 1; line-height: 1.35;">
                    <strong style="color: #4338ca;">${ind.num}</strong> ${ind.text}
                  </div>
                  <div style="flex-shrink: 0;">
                    <select class="score-select modal-comp-select" data-domain="${domKey}" data-index="${indIdx}" onchange="updateLiveCompetenciesModalMode()" style="padding: 0.2rem 0.4rem; font-weight: 600;">
                      <option value="3" ${currentVal === 3 ? 'selected' : ''}>3 (ดีเยี่ยม)</option>
                      <option value="2" ${currentVal === 2 ? 'selected' : ''}>2 (ดี)</option>
                      <option value="1" ${currentVal === 1 ? 'selected' : ''}>1 (ผ่าน)</option>
                      <option value="0" ${currentVal === 0 ? 'selected' : ''}>0 (ไม่ผ่าน)</option>
                    </select>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  modal.classList.add('open');
}

function closeCompetenciesDetailModal() {
  const modal = document.getElementById('competencies-detail-modal');
  if (modal) modal.classList.remove('open');
}

function updateLiveCompetenciesModalMode() {
  const selects = document.querySelectorAll('.modal-comp-select');
  const domMap = {};

  selects.forEach(s => {
    const dom = s.getAttribute('data-domain');
    if (!domMap[dom]) domMap[dom] = [];
    domMap[dom].push(parseInt(s.value, 10));
  });

  const domModes = [];
  Object.keys(domMap).forEach(domKey => {
    const dMode = calculateMode(domMap[domKey]);
    domModes.push(dMode);
    const badgeEl = document.getElementById(`modal-comp-dom-mode-${domKey}`);
    if (badgeEl) badgeEl.textContent = `ฐานนิยม: ${dMode}`;
  });

  const overallMode = calculateMode(domModes);
  const liveModeEl = document.getElementById('modal-competencies-live-mode');
  if (liveModeEl) {
    const lvl = EVALUATION_META.scoreLevels[overallMode] || EVALUATION_META.scoreLevels[0];
    liveModeEl.textContent = `${lvl.label} (${overallMode})`;
  }
}

function setModalCompetenciesAllScores(val) {
  const selects = document.querySelectorAll('.modal-comp-select');
  selects.forEach(s => s.value = val);
  updateLiveCompetenciesModalMode();
}

function saveCompetenciesDetailModal(event) {
  event.preventDefault();
  const studentId = parseInt(document.getElementById('modal-competencies-student-id').value, 10);
  const s = getStudentCompetenciesScores(studentId);

  const domModes = [];
  ['k1', 'k2', 'k3', 'k4', 'k5'].forEach(domKey => {
    const selects = document.querySelectorAll(`.modal-comp-select[data-domain="${domKey}"]`);
    s.detailItems[domKey] = Array.from(selects).map(sel => parseInt(sel.value, 10));
    s[domKey] = calculateMode(s.detailItems[domKey]);
    domModes.push(s[domKey]);
    if (s.term1) s.term1[domKey] = s[domKey];
  });

  s.summary = calculateMode(domModes);
  if (s.term1) s.term1.summary = s.summary;

  closeCompetenciesDetailModal();
  saveData(false);
  renderCompetenciesTable();
  updateDashboardKpis();
  showToast('บันทึกผลการประเมินสมรรถนะสำคัญผู้เรียน 25 ตัวชี้วัดเรียบร้อยแล้ว', 'success');
}

function printCompetenciesOfficialDoc() {
  const s = state.schoolInfo || {};
  const currentGrade = s.gradeLevel || 'ประถมศึกษาปีที่ 1';
  const students = getStudentsForActiveGrade();

  setValText('print-comp-school-name', s.schoolName || 'โรงเรียนบ้านสันดาบ');
  setValText('print-comp-area-zone', s.areaZone || 'สังกัดสำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร');
  setValText('print-comp-grade-level', currentGrade === 'ทั้งหมด' ? 'ประถมศึกษาปีที่ 1' : currentGrade);
  setValText('print-comp-semester', s.semester || '1');
  setValText('print-comp-academic-year', s.academicYear || '2569');
  setValText('print-comp-director-name', s.directorName || 'นายกฤษฎา ผลพล');

    // Find class teachers for this grade (all teachers)
  const teachers = getGradeTeachers(currentGrade);
  const teacherNames = formatTeachersNames(teachers, ' และ ');
  setValText('print-comp-teacher-name', teacherNames);
  const printCompTeacherHeader = document.getElementById('print-comp-teacher-header');
  if (printCompTeacherHeader) printCompTeacherHeader.textContent = teacherNames;
  const compSigContainer = document.getElementById('print-competencies-signatures');
  if (compSigContainer) {
    compSigContainer.innerHTML = buildOfficialSignaturesHtml(currentGrade, s.directorName);
  }

  const tableEl = document.getElementById('print-competencies-table');
  if (tableEl) {
    tableEl.innerHTML = `
      <thead>
        <tr>
          <th rowspan="2" style="width: 40px;">เลขที่</th>
          <th rowspan="2" style="width: 75px;">รหัส</th>
          <th rowspan="2" style="width: 170px;">ชื่อ - สกุล</th>
          <th colspan="5">สมรรถนะสำคัญผู้เรียน (5 ด้าน)</th>
          <th rowspan="2" style="width: 80px;">สรุป (Mode)</th>
          <th rowspan="2" style="width: 80px;">ระดับคุณภาพ</th>
        </tr>
        <tr>
          <th style="font-size: 8pt; width: 60px;" title="1. ความสามารถในการสื่อสาร">1.การสื่อสาร</th>
          <th style="font-size: 8pt; width: 60px;" title="2. ความสามารถในการคิด">2.การคิด</th>
          <th style="font-size: 8pt; width: 60px;" title="3. ความสามารถในการแก้ปัญหา">3.แก้ปัญหา</th>
          <th style="font-size: 8pt; width: 60px;" title="4. ความสามารถในการใช้ทักษะชีวิต">4.ทักษะชีวิต</th>
          <th style="font-size: 8pt; width: 60px;" title="5. ความสามารถในการใช้เทคโนโลยี">5.เทคโนโลยี</th>
        </tr>
      </thead>
      <tbody>
        ${students.map((st, idx) => {
          const sc = getStudentCompetenciesScores(st.id);
          const lvl = EVALUATION_META.scoreLevels[sc.summary] || EVALUATION_META.scoreLevels[0];
          return `
            <tr>
              <td>${idx + 1}</td>
              <td style="font-family: monospace;">${st.studentCode}</td>
              <td class="text-left">${st.prefix}${st.firstName} ${st.lastName}</td>
              <td>${sc.k1}</td>
              <td>${sc.k2}</td>
              <td>${sc.k3}</td>
              <td>${sc.k4}</td>
              <td>${sc.k5}</td>
              <td><strong>${sc.summary}</strong></td>
              <td>${lvl.label}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    `;
  }

  document.body.className = 'printing-competencies';
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('printing-competencies');
  }, { once: true });
  setTimeout(() => {
    document.body.classList.remove('printing-competencies');
  }, 2000);
  window.print();
}

// Aliases for inline HTML onclick handlers
window.printOfficialReadingDoc = printReadingOfficialDoc;
window.printOfficialCharacteristicsDoc = printCharacteristicsOfficialDoc;
window.printOfficialCompetenciesDoc = printCompetenciesOfficialDoc;
window.toggleCompetenciesCriteriaPanel = toggleCompetenciesCriteriaPanel;

function getScoreBadge(score) {
  const lvl = EVALUATION_META.scoreLevels[score] || EVALUATION_META.scoreLevels[0];
  return `<span class="badge-score ${lvl.class}">${lvl.label} (${score})</span>`;
}

function getScoreLevelLabel(score) {
  const lvl = EVALUATION_META.scoreLevels[score] || EVALUATION_META.scoreLevels[0];
  return lvl ? lvl.label : 'ไม่ผ่าน';
}

function getQualitativeLabel(score) {
  const lvl = EVALUATION_META.scoreLevels[score] || EVALUATION_META.scoreLevels[0];
  return lvl ? lvl.label : 'ไม่ผ่าน';
}

/* ==========================================================================
   9. Official Printable Report (ช่องที่ 7)
   ========================================================================== */
function renderReportTable() {
  const tbody = document.getElementById('report-table-body');
  if (!tbody) return;

  const s = state.schoolInfo || {};
  const currentGrade = s.gradeLevel || 'ประถมศึกษาปีที่ 1';
  const isAll = currentGrade === 'ทั้งหมด';
  const gradeLabel = isAll ? 'ทุกระดับชั้น (ป.1 - ป.6)' : (currentGrade.startsWith('ชั้น') ? currentGrade : `ชั้น${currentGrade}`);
  const semesterText = (s.semester === 'ตลอดปีการศึกษา') ? 'ตลอดปีการศึกษา' : `ภาคเรียนที่ ${s.semester || '1'}`;

  const teachers = getGradeTeachers(currentGrade);
  const teacherNames = formatTeachersNames(teachers, ' และ ');

  setText('report-school-name', s.schoolName || 'โรงเรียนบ้านสันดาบ');
  setText('report-grade-room', isAll ? gradeLabel : `${gradeLabel} ห้อง ${s.room || '1'}`);
  setText('report-academic-year', s.academicYear || '2569');
  setText('report-teacher-name', teacherNames);

  const repSem = document.getElementById('report-semester');
  if (repSem) repSem.textContent = semesterText;

  setText('sig-teacher-name', teacherNames);
  setText('sig-director-name', s.directorName || 'นายกฤษฎา ผลพล');

  const reportSigContainer = document.getElementById('report-signatures-container');
  if (reportSigContainer) {
    reportSigContainer.innerHTML = buildOfficialSignaturesHtml(currentGrade, s.directorName);
  }

  const students = getStudentsForActiveGrade();
  if (students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">ไม่พบข้อมูลนักเรียนใน ${gradeLabel}</td></tr>`;
    return;
  }

  tbody.innerHTML = students.map((st, idx) => {
    const r = state.readingAssessments[st.id]?.summary ?? 0;
    const c = state.characteristicsAssessments[st.id]?.summary ?? 0;
    const k = state.competenciesAssessments[st.id]?.summary ?? 0;

    let overall = 0;
    if (r === 0 || c === 0 || k === 0) overall = 0;
    else if (r === 1 || c === 1 || k === 1) overall = 1;
    else if (r === 2 || c === 2 || k === 2) overall = 2;
    else overall = 3;

    const isPassed = (overall >= 1);
    const qual = getQualitativeLabel(overall);
    const stNum = (st.studentNumber && String(st.studentNumber).trim() !== '' && String(st.studentNumber).trim() !== '-') ? st.studentNumber : (idx + 1);
    const stName = `${st.prefix || st.title || ''}${st.firstName || ''} ${st.lastName || ''}`.trim() || st.name || '-';

    return `
      <tr style="border-bottom: 1px solid #000;">
        <td style="text-align: center; border-right: 1px solid #000; padding: 5px;">${stNum}</td>
        <td style="text-align: center; border-right: 1px solid #000; font-family: monospace; padding: 5px;">${st.studentCode || '-'}</td>
        <td style="border-right: 1px solid #000; text-align: left; padding: 5px 8px; white-space: nowrap;">${stName}</td>
        <td style="text-align: center; border-right: 1px solid #000; padding: 5px;">${getQualitativeLabel(r)} (${r})</td>
        <td style="text-align: center; border-right: 1px solid #000; padding: 5px;">${getQualitativeLabel(c)} (${c})</td>
        <td style="text-align: center; border-right: 1px solid #000; padding: 5px;">${getQualitativeLabel(k)} (${k})</td>
        <td style="text-align: center; border-right: 1px solid #000; padding: 5px; font-weight: 700;">${qual} (${overall})</td>
        <td style="text-align: center; padding: 5px; font-weight: 700; color: ${isPassed ? '#15803d' : '#b91c1c'};">
          ${isPassed ? 'ผ่านเกณฑ์' : 'ไม่ผ่านเกณฑ์'}
        </td>
      </tr>
    `;
  }).join('');
}

function printReportOfficialDoc() {
  renderReportTable();
  document.body.className = 'printing-report';
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('printing-report');
  }, { once: true });
  setTimeout(() => {
    document.body.classList.remove('printing-report');
  }, 2000);
  window.print();
}

/* ==========================================================================
   10. Dashboard KPIs & Chart Updates (คำนวณจากข้อมูลจริง 100%)
   ========================================================================== */
function updateDashboardKpis() {
  const allStudents = state.students || [];
  const totalAll = allStudents.length;
  const currentGrade = state.schoolInfo.gradeLevel || 'ประถมศึกษาปีที่ 1';
  const gradeStudents = getStudentsForActiveGrade();
  const isAll = currentGrade === 'ทั้งหมด';

  // 1. KPI Total Students
  setText('kpi-total-students', totalAll);
  const studentsSub = document.getElementById('kpi-students-sub');
  if (studentsSub) {
    if (isAll) {
      studentsSub.textContent = `ป.1 - ป.6 รวม ${totalAll} คน`;
    } else {
      const shortG = formatShortGrade(currentGrade);
      studentsSub.textContent = `ชั้น ${shortG}: ${gradeStudents.length} คน (ทั้งหมด ${totalAll} คน)`;
    }
  }

  // 2. KPI Total Teachers
  const totalTeachers = (state.teachers && state.teachers.length) || 10;
  setText('kpi-total-teachers', totalTeachers);
  const teachersSub = document.getElementById('kpi-teachers-sub');
  if (teachersSub) {
    teachersSub.textContent = `ครูประจำชั้น ป.1 - ป.6 (ครบ 6 ระดับชั้น)`;
  }

  // 3. KPI Total Domains
  setText('kpi-total-domains', 3);

  // 4. KPI Progress calculation from real assessment scores (summary > 0)
  let rCount = 0, cCount = 0, kCount = 0;
  allStudents.forEach(st => {
    if (state.readingAssessments && state.readingAssessments[st.id] && state.readingAssessments[st.id].summary > 0) rCount++;
    if (state.characteristicsAssessments && state.characteristicsAssessments[st.id] && state.characteristicsAssessments[st.id].summary > 0) cCount++;
    if (state.competenciesAssessments && state.competenciesAssessments[st.id] && state.competenciesAssessments[st.id].summary > 0) kCount++;
  });

  const totalPossible = totalAll * 3;
  const totalDone = rCount + cCount + kCount;
  const progressPct = (totalPossible > 0 && totalDone > 0) ? Math.round((totalDone / totalPossible) * 100) : 0;

  setText('kpi-progress-val', `${progressPct}%`);
  setText('kpi-progress-pct', `${progressPct}%`);
  const gaugeEl = document.querySelector('.gauge-circle');
  if (gaugeEl) {
    gaugeEl.style.background = `conic-gradient(#10b981 0% ${progressPct}%, #e2e8f0 ${progressPct}% 100%)`;
  }
  const progressSub = document.getElementById('kpi-progress-sub');
  if (progressSub) {
    if (progressPct >= 100) {
      progressSub.textContent = `ประเมินครบถ้วน 100% (${totalAll} คน)`;
    } else if (progressPct === 0) {
      progressSub.textContent = `ยังไม่ได้เริ่มการประเมิน (0%)`;
    } else {
      progressSub.textContent = `ประเมินแล้ว ${totalDone} จาก ${totalPossible} รายการ (${progressPct}%)`;
    }
  }

  // 5. Calculate Real Domain Percentages (Average score % from actual non-zero scores)
  const calcRealDomainPct = (assessObj) => {
    if (totalAll === 0 || !assessObj) return 0;
    let totalScore = 0;
    allStudents.forEach(st => {
      const s = assessObj[st.id]?.summary ?? 0;
      totalScore += (s > 0 ? s : 0);
    });
    return Math.round((totalScore / (totalAll * 3)) * 100);
  };

  const rPct = calcRealDomainPct(state.readingAssessments);
  const cPct = calcRealDomainPct(state.characteristicsAssessments);
  const kPct = calcRealDomainPct(state.competenciesAssessments);

  setText('chart-val-reading', `${rPct}%`);
  setText('chart-val-char', `${cPct}%`);
  setText('chart-val-comp', `${kPct}%`);

  const pR = document.getElementById('chart-pillar-reading');
  const pC = document.getElementById('chart-pillar-char');
  const pK = document.getElementById('chart-pillar-comp');

  if (pR) pR.style.height = `${rPct}%`;
  if (pC) pC.style.height = `${cPct}%`;
  if (pK) pK.style.height = `${kPct}%`;

  // 6. Render Recent Evaluations Table
  renderRecentEvaluations();
}

function renderRecentEvaluations() {
  const tbody = document.getElementById('recent-eval-tbody');
  if (!tbody) return;

  const allStudents = state.students || [];
  const totalStudents = allStudents.length;

  let rDone = 0, cDone = 0, kDone = 0;
  allStudents.forEach(st => {
    if (state.readingAssessments && state.readingAssessments[st.id] && state.readingAssessments[st.id].summary > 0) rDone++;
    if (state.characteristicsAssessments && state.characteristicsAssessments[st.id] && state.characteristicsAssessments[st.id].summary > 0) cDone++;
    if (state.competenciesAssessments && state.competenciesAssessments[st.id] && state.competenciesAssessments[st.id].summary > 0) kDone++;
  });

  const getStatusPill = (doneCount, total) => {
    if (total === 0) return '<span class="status-pill status-pending"><i class="fa-solid fa-hourglass-start"></i> ไม่มีนักเรียน</span>';
    if (doneCount >= total) return `<span class="status-pill status-done"><i class="fa-solid fa-circle-check"></i> เสร็จสิ้น (${doneCount}/${total} คน)</span>`;
    if (doneCount > 0) return `<span class="status-pill status-in-progress"><i class="fa-solid fa-clock"></i> กำลังดำเนินการ (${doneCount}/${total} คน)</span>`;
    return `<span class="status-pill status-pending"><i class="fa-solid fa-hourglass-start"></i> รอประเมิน (0/${total} คน)</span>`;
  };

  const allDone = (rDone >= totalStudents && cDone >= totalStudents && kDone >= totalStudents && totalStudents > 0);
  const reportStatus = allDone 
    ? '<span class="status-pill status-done"><i class="fa-solid fa-circle-check"></i> พร้อมออกเอกสาร</span>'
    : '<span class="status-pill status-pending"><i class="fa-solid fa-hourglass-start"></i> รอประเมินครบ 3 ด้าน</span>';

  const sem = state.schoolInfo.semester || '1';
  const yr = state.schoolInfo.academicYear || '2569';

  tbody.innerHTML = `
    <tr>
      <td style="text-align: center; font-weight: 600;">1</td>
      <td><strong>การอ่าน คิดวิเคราะห์ และเขียนสื่อความ</strong></td>
      <td style="text-align: center;">${getStatusPill(rDone, totalStudents)}</td>
      <td style="text-align: center; color: var(--text-muted);">ภาคเรียนที่ ${sem}/${yr}</td>
      <td style="text-align: center;"><button class="btn-detail-link" onclick="switchTab('tab-reading')">ดูรายละเอียด</button></td>
    </tr>
    <tr>
      <td style="text-align: center; font-weight: 600;">2</td>
      <td><strong>คุณลักษณะอันพึงประสงค์ (8 ประการ)</strong></td>
      <td style="text-align: center;">${getStatusPill(cDone, totalStudents)}</td>
      <td style="text-align: center; color: var(--text-muted);">ภาคเรียนที่ ${sem}/${yr}</td>
      <td style="text-align: center;"><button class="btn-detail-link" onclick="switchTab('tab-characteristics')">ดูรายละเอียด</button></td>
    </tr>
    <tr>
      <td style="text-align: center; font-weight: 600;">3</td>
      <td><strong>สมรรถนะสำคัญผู้เรียน (5 ด้าน)</strong></td>
      <td style="text-align: center;">${getStatusPill(kDone, totalStudents)}</td>
      <td style="text-align: center; color: var(--text-muted);">ภาคเรียนที่ ${sem}/${yr}</td>
      <td style="text-align: center;"><button class="btn-detail-link" onclick="switchTab('tab-competencies')">ดูรายละเอียด</button></td>
    </tr>
    <tr>
      <td style="text-align: center; font-weight: 600;">4</td>
      <td><strong>สรุปรายงานผลการประเมิน</strong></td>
      <td style="text-align: center;">${reportStatus}</td>
      <td style="text-align: center; color: var(--text-muted);">ปีการศึกษา ${yr}</td>
      <td style="text-align: center;"><button class="btn-detail-link" onclick="switchTab('tab-report')">ดูรายละเอียด</button></td>
    </tr>
  `;
}
/* ==========================================================================
   11. Helper Utilities & Export
   ========================================================================== */
function exportDataJson() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const a = document.createElement('a');
  a.setAttribute("href", dataStr);
  a.setAttribute("download", `แบบประเมินผู้เรียน_โรงเรียนบ้านสันดาบ_${state.schoolInfo.gradeLevel || 'ป1'}.json`);
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast('ส่งออกไฟล์ข้อมูล JSON เรียบร้อยแล้ว', 'info');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-info-circle'}"></i> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/* ==========================================================================
   12. Dynamic Semester & Year Handlers
   ========================================================================== */
function updateSemesterFromSelect(val) {
  if (!state.schoolInfo) state.schoolInfo = {};
  state.schoolInfo.semester = val;
  saveData(true);
  updateGradeDisplay();
  renderStudentsTable();
  renderReadingTable();
  renderCharacteristicsTable();
  renderCompetenciesTable();
  renderReportTable();
  renderHeaderInfo();
  updateDashboardKpis();
  showToast(`เปลี่ยนภาคเรียนเป็น: ${val === 'ตลอดปีการศึกษา' ? 'ตลอดปีการศึกษา' : 'ภาคเรียนที่ ' + val}`, 'info');
}

function updateAcademicYearFromInput(val) {
  const cleanVal = (val || '2569').trim();
  if (!state.schoolInfo) state.schoolInfo = {};
  state.schoolInfo.academicYear = cleanVal;
  saveData(true);
  updateGradeDisplay();
  renderStudentsTable();
  renderReadingTable();
  renderCharacteristicsTable();
  renderCompetenciesTable();
  renderReportTable();
  renderHeaderInfo();
  updateDashboardKpis();
  showToast(`เปลี่ยนปีการศึกษาเป็น: ${cleanVal}`, 'info');
}

/* ==========================================================================
   13. Booklet Printing Engine (เล่มรายงานผลการประเมิน 3 เล่ม + เล่มสรุป)
   ยึดตามโครงสร้างเอกสารทางการในโฟลเดอร์:
   1. แบบประเมินการอ่าน คิดวิเคราะห์\ผลการประเมินการอ่าน คิดวิเคราะห์.docx
   2. แบบประเมินคุณลักษณะอันพึ่งประสงค์\ป1 ผลการประเมินคุณลักษณะอันพึ่งประสงค์.docx
   3. แบบประเมินสมรรถนะ\ผลการประเมินสมรรถนะสำคัญผู้เรียน.docx
   ========================================================================== */

function getGradeTeacherName(grade) {
  const teachers = getGradeTeachers(grade);
  return formatTeachersNames(teachers, ' และ ');
}

function getTeachersMapByGrade() {
  const map = {};
  const validGrades = ['ประถมศึกษาปีที่ 1', 'ประถมศึกษาปีที่ 2', 'ประถมศึกษาปีที่ 3', 'ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6'];
  validGrades.forEach(g => {
    map[g] = getGradeTeacherName(g);
  });
  return map;
}

function buildBookletCoverHtml(bookletTitle, subTitle, gradeLabel, semester, year, directorName, teacherNameOrGrade, coverImage = null) {
  const semYearText = (semester === 'ตลอดปีการศึกษา' || semester === 'ทั้งปีการศึกษา') ? `ตลอดปีการศึกษา ${year}` : `ภาคเรียนที่ ${semester} ปีการศึกษา ${year}`;
  
  let formattedTeachers = '';
  if (typeof teacherNameOrGrade === 'string' && (teacherNameOrGrade === 'ทั้งหมด' || teacherNameOrGrade.includes('1 - 6') || teacherNameOrGrade.includes('ทุกระดับชั้น'))) {
    formattedTeachers = 'คณะครูประจำชั้นประถมศึกษาปีที่ 1 - 6';
  } else if (typeof teacherNameOrGrade === 'string' && teacherNameOrGrade.includes('ประถมศึกษา')) {
    formattedTeachers = formatTeachersNames(getGradeTeachers(teacherNameOrGrade), ' และ ');
  } else if (Array.isArray(teacherNameOrGrade)) {
    formattedTeachers = formatTeachersNames(teacherNameOrGrade, ' และ ');
  } else if (typeof teacherNameOrGrade === 'string' && teacherNameOrGrade && !teacherNameOrGrade.includes('...')) {
    formattedTeachers = teacherNameOrGrade;
  } else {
    formattedTeachers = formatTeachersNames(getGradeTeachers(state.schoolInfo?.gradeLevel || 'ประถมศึกษาปีที่ 1'), ' และ ');
  }

  const dirName = directorName || state.schoolInfo?.directorName || 'นายกฤษฎา ผลพล';

  if (coverImage) {
    return `
      <div class="print-booklet-cover print-page-break" style="width: 100%; height: 279mm; max-height: 279mm; display: flex; flex-direction: column; justify-content: flex-start; align-items: center; margin: 0; padding: 0; box-sizing: border-box; overflow: hidden; background: #ffffff;">
        <img src="${coverImage}" alt="${bookletTitle}" class="print-booklet-cover-img" style="width: 100%; height: 254mm; min-height: 254mm; max-height: 254mm; object-fit: fill; border-radius: 6px; border: 1px solid #cbd5e1; display: block; margin: 0 0 2.5mm 0; box-sizing: border-box;">
        
        <div class="print-booklet-cover-info" style="width: 100%; height: 22.5mm; min-height: 22.5mm; max-height: 22.5mm; background: #ffffff; border: 2px solid #2563eb; border-radius: 8px; padding: 3px 12px; text-align: center; box-sizing: border-box; flex-shrink: 0; display: flex; flex-direction: column; justify-content: center; align-items: center;">
          <div style="font-size: 1.05rem; font-weight: 800; color: #1e3a8a; margin-bottom: 1px;">
            ${gradeLabel} &nbsp;|&nbsp; ${semYearText}
          </div>
          <div style="font-size: 0.86rem; color: #334155; font-weight: 600; line-height: 1.35;">
            <span>ครูประจำชั้น: <strong style="color: #0f172a;">${formattedTeachers || '-'}</strong></span>
            &nbsp;&nbsp;•&nbsp;&nbsp;
            <span>ผู้อำนวยการโรงเรียน: <strong style="color: #0f172a;">${dirName}</strong></span>
          </div>
        </div>
      </div>
    `;
  }

  // Formal Certificate Style Cover (for Summary Report or fallback)
  return `
    <div class="print-booklet-cover print-page-break" style="width: 100%; height: 280mm; max-height: 280mm; display: flex; flex-direction: column; justify-content: center; align-items: stretch; margin: 0; padding: 0; box-sizing: border-box; overflow: hidden;">
      <div class="print-booklet-cover-border" style="width: 100%; height: 100%; max-height: 280mm; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-around; align-items: center; border: 4px double #1e3a8a; border-radius: 14px; padding: 18px 20px;">
        <div style="margin-bottom: 0.5rem;">
          <img src="images/school_logo.png" alt="ตราโรงเรียนบ้านสันดาบ" style="width: 90px; height: auto; object-fit: contain;" onerror="this.style.display='none'">
        </div>
        
        <div style="font-size: 1.16rem; font-weight: 700; color: #1e3a8a; margin-bottom: 0.2rem; letter-spacing: 0.5px;">
          แบบบันทึกรายงานผลการประเมินคุณภาพผู้เรียน
        </div>
        
        <h1 style="font-size: 1.68rem; font-weight: 800; color: #0f172a; margin: 0.4rem 0; line-height: 1.35; padding: 0 1rem;">
          ${bookletTitle}
        </h1>
        
        <div style="font-size: 1.02rem; font-weight: 600; color: #334155; margin-bottom: 0.8rem;">
          ${subTitle || 'ตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พุทธศักราช 2551'}
        </div>
        
        <div style="margin: 0.6rem 0; padding: 0.75rem 2.0rem; background: #f8fafc; border: 2px solid #cbd5e1; border-radius: 12px; display: inline-block; min-width: 320px;">
          <div style="font-size: 1.22rem; font-weight: 800; color: #1e293b; margin-bottom: 0.25rem;">
            ${gradeLabel}
          </div>
          <div style="font-size: 1.02rem; font-weight: 600; color: #475569;">
            ${semText} ปีการศึกษา ${year}
          </div>
        </div>

        <div style="margin: 0.75rem auto; width: 100%; max-width: 480px; text-align: left; font-size: 0.95rem; line-height: 1.8; color: #1e293b; background: #ffffff; padding: 0.75rem 1.4rem; border: 1.5px dashed #94a3b8; border-radius: 8px;">
          <div style="display: flex; margin-bottom: 2px;">
            <strong style="color: #0f172a; min-width: 115px;">ครูประจำชั้น:</strong>
            <span style="flex: 1; font-weight: 600;">${formattedTeachers || '-'}</span>
          </div>
          <div style="display: flex;">
            <strong style="color: #0f172a; min-width: 115px;">ผู้อำนวยการโรงเรียน:</strong>
            <span style="flex: 1; font-weight: 600;">${dirName}</span>
          </div>
        </div>

        <div style="margin-top: 0.75rem; font-size: 0.96rem; color: #1e293b; line-height: 1.6;">
          <div style="font-weight: 800; font-size: 1.18rem; color: #0f172a;">โรงเรียนบ้านสันดาบ</div>
          <div style="font-weight: 600; color: #334155;">สำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร</div>
          <div style="font-size: 0.88rem; color: #64748b;">สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน กระทรวงศึกษาธิการ</div>
        </div>
      </div>
    </div>
  `;
}

function buildBookletPageHeaderHtml(title, gradeName, semester, year, subTitleText) {
  const semText = semester === 'ตลอดปีการศึกษา' ? 'ตลอดปีการศึกษา' : `ภาคเรียนที่ ${semester}`;
  return `
    <div style="text-align: center; margin-bottom: 0.50rem; border-bottom: 2px solid #000; padding-bottom: 0.28rem;">
      <h2 style="font-size: 1.15rem; font-weight: 800; margin: 0 0 0.18rem 0; color: #000; line-height: 1.25;">${title}</h2>
      ${subTitleText ? `<div style="font-size: 0.95rem; font-weight: 700; color: #1e3a8a; margin-bottom: 0.15rem;">${subTitleText}</div>` : ''}
      <div style="font-size: 0.90rem; font-weight: 700; color: #000;">
        โรงเรียนบ้านสันดาบ สังกัดสำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร
      </div>
      <div style="font-size: 0.84rem; font-weight: 600; color: #111; margin-top: 0.15rem;">
        ชั้น${gradeName} | ${semText} ปีการศึกษา ${year}
      </div>
    </div>
  `;
}

function buildStatsTableHtml(stats, total) {
  const p3 = total > 0 ? ((stats.excellent / total) * 100).toFixed(2) : '0.00';
  const p2 = total > 0 ? ((stats.good / total) * 100).toFixed(2) : '0.00';
  const p1 = total > 0 ? ((stats.pass / total) * 100).toFixed(2) : '0.00';
  const p0 = total > 0 ? ((stats.fail / total) * 100).toFixed(2) : '0.00';
  const passGood = stats.excellent + stats.good;
  const pGood = total > 0 ? ((passGood / total) * 100).toFixed(2) : '0.00';

  return `
    <div style="margin-top: 0.5rem; page-break-inside: avoid; break-inside: avoid;">
      <div style="font-weight: 700; font-size: 0.80rem; margin-bottom: 0.2rem; color: #000;">
        สรุปผลการประเมิน (จำนวนนักเรียนทั้งหมด ${total} คน)
      </div>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 0.76rem; text-align: center;">
        <thead>
          <tr style="background: #f1f5f9; border-bottom: 1px solid #000;">
            <th style="border-right: 1px solid #000; padding: 3px 4px;">ระดับคุณภาพ</th>
            <th style="border-right: 1px solid #000; padding: 3px 4px; width: 18%;">ดีเยี่ยม (3)</th>
            <th style="border-right: 1px solid #000; padding: 3px 4px; width: 18%;">ดี (2)</th>
            <th style="border-right: 1px solid #000; padding: 3px 4px; width: 18%;">ผ่าน (1)</th>
            <th style="border-right: 1px solid #000; padding: 3px 4px; width: 18%;">ไม่ผ่าน (0)</th>
            <th style="padding: 3px 4px; width: 18%;">ระดับดีขึ้นไป</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom: 1px solid #000;">
            <td style="border-right: 1px solid #000; padding: 3px 4px; font-weight: 600; text-align: left; padding-left: 8px;">จำนวน (คน)</td>
            <td style="border-right: 1px solid #000; padding: 3px 4px; font-weight: 700;">${stats.excellent}</td>
            <td style="border-right: 1px solid #000; padding: 3px 4px; font-weight: 700;">${stats.good}</td>
            <td style="border-right: 1px solid #000; padding: 3px 4px; font-weight: 700;">${stats.pass}</td>
            <td style="border-right: 1px solid #000; padding: 3px 4px; font-weight: 700; color: ${stats.fail > 0 ? '#dc2626' : '#000'};">${stats.fail}</td>
            <td style="padding: 3px 4px; font-weight: 700; color: #15803d;">${passGood}</td>
          </tr>
          <tr>
            <td style="border-right: 1px solid #000; padding: 3px 4px; font-weight: 600; text-align: left; padding-left: 8px;">ร้อยละ (%)</td>
            <td style="border-right: 1px solid #000; padding: 3px 4px;">${p3}%</td>
            <td style="border-right: 1px solid #000; padding: 3px 4px;">${p2}%</td>
            <td style="border-right: 1px solid #000; padding: 3px 4px;">${p1}%</td>
            <td style="border-right: 1px solid #000; padding: 3px 4px; color: ${stats.fail > 0 ? '#dc2626' : '#000'};">${p0}%</td>
            <td style="padding: 3px 4px; font-weight: 700; color: #15803d;">${pGood}%</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function buildMultiDomainStatsTableHtml(rStats, cStats, kStats, oStats, total) {
  const calcPct = (cnt) => total > 0 ? ((cnt / total) * 100).toFixed(2) : '0.00';
  const rPass = rStats.excellent + rStats.good + rStats.pass;
  const cPass = cStats.excellent + cStats.good + cStats.pass;
  const kPass = kStats.excellent + kStats.good + kStats.pass;
  const oPass = oStats.excellent + oStats.good + oStats.pass;

  return `
    <div style="margin-top: 0.5rem; page-break-inside: avoid; break-inside: avoid;">
      <div style="font-weight: 700; font-size: 0.80rem; margin-bottom: 0.2rem; color: #000;">
        สรุปผลการประเมินคุณภาพผู้เรียนรายด้าน (จำนวนนักเรียน ${total} คน)
      </div>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 0.76rem; text-align: center;">
        <thead>
          <tr style="background: #f1f5f9; border-bottom: 1px solid #000;">
            <th style="border-right: 1px solid #000; padding: 3px 4px; text-align: left; padding-left: 8px;">ด้านการประเมิน</th>
            <th style="border-right: 1px solid #000; padding: 3px 4px; width: 16%;">ดีเยี่ยม (3)</th>
            <th style="border-right: 1px solid #000; padding: 3px 4px; width: 16%;">ดี (2)</th>
            <th style="border-right: 1px solid #000; padding: 3px 4px; width: 16%;">ผ่าน (1)</th>
            <th style="border-right: 1px solid #000; padding: 3px 4px; width: 16%;">ไม่ผ่าน (0)</th>
            <th style="padding: 3px 4px; width: 18%;">ผ่านเกณฑ์ (%)</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom: 1px solid #000;">
            <td style="border-right: 1px solid #000; padding: 3px 4px; font-weight: 600; text-align: left; padding-left: 8px;">1. การอ่าน คิดวิเคราะห์ฯ</td>
            <td style="border-right: 1px solid #000; padding: 3px 4px;">${rStats.excellent} (${calcPct(rStats.excellent)}%)</td>
            <td style="border-right: 1px solid #000; padding: 3px 4px;">${rStats.good} (${calcPct(rStats.good)}%)</td>
            <td style="border-right: 1px solid #000; padding: 3px 4px;">${rStats.pass} (${calcPct(rStats.pass)}%)</td>
            <td style="border-right: 1px solid #000; padding: 3px 4px; color: ${rStats.fail > 0 ? '#dc2626' : '#000'};">${rStats.fail}</td>
            <td style="padding: 3px 4px; font-weight: 700; color: #15803d;">${calcPct(rPass)}%</td>
          </tr>
          <tr style="border-bottom: 1px solid #000;">
            <td style="border-right: 1px solid #000; padding: 3px 4px; font-weight: 600; text-align: left; padding-left: 8px;">2. คุณลักษณะอันพึงประสงค์</td>
            <td style="border-right: 1px solid #000; padding: 3px 4px;">${cStats.excellent} (${calcPct(cStats.excellent)}%)</td>
            <td style="border-right: 1px solid #000; padding: 3px 4px;">${cStats.good} (${calcPct(cStats.good)}%)</td>
            <td style="border-right: 1px solid #000; padding: 3px 4px;">${cStats.pass} (${calcPct(cStats.pass)}%)</td>
            <td style="border-right: 1px solid #000; padding: 3px 4px; color: ${cStats.fail > 0 ? '#dc2626' : '#000'};">${cStats.fail}</td>
            <td style="padding: 3px 4px; font-weight: 700; color: #15803d;">${calcPct(cPass)}%</td>
          </tr>
          <tr style="border-bottom: 1px solid #000;">
            <td style="border-right: 1px solid #000; padding: 3px 4px; font-weight: 600; text-align: left; padding-left: 8px;">3. สมรรถนะสำคัญผู้เรียน</td>
            <td style="border-right: 1px solid #000; padding: 3px 4px;">${kStats.excellent} (${calcPct(kStats.excellent)}%)</td>
            <td style="border-right: 1px solid #000; padding: 3px 4px;">${kStats.good} (${calcPct(kStats.good)}%)</td>
            <td style="border-right: 1px solid #000; padding: 3px 4px;">${kStats.pass} (${calcPct(kStats.pass)}%)</td>
            <td style="border-right: 1px solid #000; padding: 3px 4px; color: ${kStats.fail > 0 ? '#dc2626' : '#000'};">${kStats.fail}</td>
            <td style="padding: 3px 4px; font-weight: 700; color: #15803d;">${calcPct(kPass)}%</td>
          </tr>
          <tr style="background: #f8fafc;">
            <td style="border-right: 1px solid #000; padding: 3px 4px; font-weight: 700; text-align: left; padding-left: 8px;">สรุปผลภาพรวม</td>
            <td style="border-right: 1px solid #000; padding: 3px 4px; font-weight: 700;">${oStats.excellent} (${calcPct(oStats.excellent)}%)</td>
            <td style="border-right: 1px solid #000; padding: 2px 4px; font-weight: 700;">${oStats.good} (${calcPct(oStats.good)}%)</td>
            <td style="border-right: 1px solid #000; padding: 2px 4px; font-weight: 700;">${oStats.pass} (${calcPct(oStats.pass)}%)</td>
            <td style="border-right: 1px solid #000; padding: 2px 4px; font-weight: 700; color: ${oStats.fail > 0 ? '#dc2626' : '#000'};">${oStats.fail}</td>
            <td style="padding: 3px 4px; font-weight: 800; color: #15803d;">${calcPct(oPass)}%</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function buildRubricCriteriaTableHtml(type) {
  let title = '';
  let colHeader = '';
  let rows = [];

  if (type === 'reading') {
    title = 'เกณฑ์การตัดสินคุณภาพ (การอ่าน คิดวิเคราะห์ และเขียนสื่อความ)';
    colHeader = 'ความสามารถในการอ่าน คิดวิเคราะห์ และเขียนที่ปรากฏให้เห็น';
    rows = [
      { score: 3, label: 'ดีเยี่ยม', desc: 'สามารถจับใจความสำคัญได้ครบถ้วน เขียนวิพากษ์วิจารณ์ เขียนสร้างสรรค์ แสดงความคิดเห็นประกอบอย่างมีเหตุผลได้ถูกต้องและสมบูรณ์ ใช้ภาษาสุภาพและเรียบเรียงได้สละสลวย' },
      { score: 2, label: 'ดี', desc: 'สามารถจับใจความสำคัญได้ เขียนวิพากษ์วิจารณ์ และเขียนสร้างสรรค์ได้ โดยใช้ภาษาสุภาพ' },
      { score: 1, label: 'ผ่าน', desc: 'สามารถจับใจความสำคัญได้และเขียนวิพากษ์วิจารณ์ได้บ้าง' },
      { score: 0, label: 'ไม่ผ่าน', desc: 'มีพฤติกรรมต่ำกว่าเกณฑ์ที่กำหนด' }
    ];
  } else if (type === 'characteristics') {
    title = 'เกณฑ์การตัดสินคุณภาพ (คุณลักษณะอันพึงประสงค์ 8 ประการ)';
    colHeader = 'คุณลักษณะอันพึงประสงค์ ปรากฏให้เห็น';
    rows = [
      { score: 3, label: 'ดีเยี่ยม', desc: 'ผู้เรียนมีคุณลักษณะในการปฏิบัติจนเป็นนิสัยและนำไปใช้ในชีวิตประจำวันเพื่อประโยชน์สุขของตนเอง และสังคม' },
      { score: 2, label: 'ดี', desc: 'ผู้เรียนมีคุณลักษณะในการปฏิบัติตามกฎเกณฑ์เพื่อให้ เป็นที่ยอมรับของสังคม' },
      { score: 1, label: 'ผ่าน', desc: 'ผู้เรียนรับรู้และปฏิบัติตามกฎเกณฑ์และเงื่อนไขของสถานศึกษา' },
      { score: 0, label: 'ไม่ผ่าน', desc: 'มีพฤติกรรมไม่เป็นไปตามเกณฑ์ที่กำหนด' }
    ];
  } else if (type === 'competencies') {
    title = 'เกณฑ์การตัดสินคุณภาพ (สมรรถนะสำคัญผู้เรียน 5 ด้าน)';
    colHeader = 'สมรรถนะสำคัญผู้เรียน ปรากฏให้เห็น';
    rows = [
      { score: 3, label: 'ดีเยี่ยม', desc: 'ผู้เรียนแสดงสมรรถนะที่กำหนดได้อย่างถูกต้อง ครบถ้วน และสม่ำเสมอ สามารถประยุกต์ใช้ความรู้ ทักษะ และกระบวนการต่าง ๆ ในการเรียนรู้และสถานการณ์ในชีวิตประจำวันได้อย่างเหมาะสมด้วยตนเอง' },
      { score: 2, label: 'ดี', desc: 'ผู้เรียนแสดงสมรรถนะที่กำหนดได้อย่างถูกต้องเป็นส่วนใหญ่ สามารถนำความรู้และทักษะไปใช้ในการเรียนรู้และสถานการณ์ต่าง ๆ ได้เหมาะสม โดยอาจต้องได้รับคำแนะนำเป็นบางครั้ง' },
      { score: 1, label: 'ผ่าน', desc: 'ผู้เรียนแสดงสมรรถนะพื้นฐานตามที่กำหนดได้บางส่วน สามารถปฏิบัติหรือนำความรู้และทักษะไปใช้ได้เมื่อได้รับคำแนะนำหรือการช่วยเหลือ' },
      { score: 0, label: 'ไม่ผ่าน', desc: 'ผู้เรียนยังไม่สามารถแสดงสมรรถนะตามเกณฑ์ที่กำหนด หรือไม่สามารถนำความรู้และทักษะไปใช้ได้อย่างเหมาะสม แม้ได้รับคำแนะนำหรือการช่วยเหลือ' }
    ];
  }

  return `
    <div style="margin-top: 0.45rem; margin-bottom: 0.45rem; page-break-inside: avoid; break-inside: avoid;">
      <div style="font-weight: 700; font-size: 0.78rem; margin-bottom: 0.18rem; color: #000;">
        ${title}
      </div>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 0.72rem; text-align: left;">
        <thead>
          <tr style="background: #f1f5f9; border-bottom: 1px solid #000;">
            <th style="border-right: 1px solid #000; padding: 2.5px 5px; width: 48px; text-align: center;">เกณฑ์</th>
            <th style="border-right: 1px solid #000; padding: 2.5px 5px; width: 68px; text-align: center;">ระดับคุณภาพ</th>
            <th style="padding: 2.5px 6px;">${colHeader}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr style="border-bottom: 1px solid #000;">
              <td style="border-right: 1px solid #000; padding: 2.5px 5px; text-align: center; font-weight: 700;">${r.score}</td>
              <td style="border-right: 1px solid #000; padding: 2.5px 5px; text-align: center; font-weight: 700;">${r.label}</td>
              <td style="padding: 2.5px 6px; line-height: 1.25;">${r.desc}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function buildSingleSignatureHtml(gradeOrTeacherName) {
  let teachers = [];
  if (typeof gradeOrTeacherName === 'string' && gradeOrTeacherName.includes('ประถมศึกษา')) {
    teachers = getGradeTeachers(gradeOrTeacherName);
  } else if (Array.isArray(gradeOrTeacherName)) {
    teachers = gradeOrTeacherName;
  } else if (typeof gradeOrTeacherName === 'string' && gradeOrTeacherName && !gradeOrTeacherName.includes('...')) {
    teachers = [{ fullName: gradeOrTeacherName }];
  } else {
    teachers = getGradeTeachers(state.schoolInfo?.gradeLevel || 'ประถมศึกษาปีที่ 1');
  }

  if (teachers.length >= 2) {
    return `
      <div style="margin-top: 0.85rem; display: flex; justify-content: space-between; align-items: flex-start; width: 100%; max-width: 96%; margin-left: auto; margin-right: auto; page-break-inside: avoid; break-inside: avoid;">
        <div style="text-align: center; width: 250px; font-size: 0.82rem;">
          <div style="margin-bottom: 0.35rem; white-space: nowrap;">ลงชื่อ ............................................................ ผู้ประเมิน</div>
          <div style="font-weight: 700; white-space: nowrap; font-size: 0.86rem;">(${teachers[0].fullName || teachers[0]})</div>
          <div style="font-size: 0.78rem; color: #333; margin-top: 2px;">ตำแหน่ง ครูประจำชั้น</div>
        </div>
        <div style="text-align: center; width: 250px; font-size: 0.82rem;">
          <div style="margin-bottom: 0.35rem; white-space: nowrap;">ลงชื่อ ............................................................ ผู้ประเมิน</div>
          <div style="font-weight: 700; white-space: nowrap; font-size: 0.86rem;">(${teachers[1].fullName || teachers[1]})</div>
          <div style="font-size: 0.78rem; color: #333; margin-top: 2px;">ตำแหน่ง ครูประจำชั้น</div>
        </div>
      </div>
    `;
  }

  const tName = teachers[0]?.fullName || teachers[0] || '...........................................................';
  return `
    <div style="margin-top: 0.85rem; display: flex; justify-content: flex-end; width: 100%; max-width: 96%; margin-left: auto; margin-right: auto; page-break-inside: avoid; break-inside: avoid;">
      <div style="text-align: center; width: 260px; font-size: 0.82rem; margin-right: 1.5rem;">
        <div style="margin-bottom: 0.35rem; white-space: nowrap;">ลงชื่อ ............................................................ ผู้ประเมิน</div>
        <div style="font-weight: 700; white-space: nowrap; font-size: 0.86rem;">(${tName})</div>
        <div style="font-size: 0.78rem; color: #333; margin-top: 2px;">ตำแหน่ง ครูประจำชั้น</div>
      </div>
    </div>
  `;
}

function buildSignaturesRowHtml(gradeOrTeacherName, directorName) {
  let teachers = [];
  if (typeof gradeOrTeacherName === 'string' && gradeOrTeacherName.includes('ประถมศึกษา')) {
    teachers = getGradeTeachers(gradeOrTeacherName);
  } else if (Array.isArray(gradeOrTeacherName)) {
    teachers = gradeOrTeacherName;
  } else if (typeof gradeOrTeacherName === 'string' && gradeOrTeacherName && !gradeOrTeacherName.includes('...')) {
    teachers = [{ fullName: gradeOrTeacherName }];
  } else {
    teachers = getGradeTeachers(state.schoolInfo?.gradeLevel || 'ประถมศึกษาปีที่ 1');
  }

  const dirName = directorName || state.schoolInfo?.directorName || 'นายกฤษฎา ผลพล';

  if (teachers.length >= 2) {
    return `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 0.75rem; page-break-inside: avoid; break-inside: avoid; font-size: 0.80rem; width: 100%;">
        <div style="text-align: center; width: 31%;">
          <div style="margin-bottom: 0.25rem; white-space: nowrap;">ลงชื่อ ...................................................... ผู้ประเมิน</div>
          <div style="font-weight: 700; white-space: nowrap; font-size: 0.82rem;">(${teachers[0].fullName || teachers[0]})</div>
          <div style="font-size: 0.75rem; color: #333; margin-top: 2px;">ตำแหน่ง ครูประจำชั้น</div>
        </div>
        <div style="text-align: center; width: 31%;">
          <div style="margin-bottom: 0.25rem; white-space: nowrap;">ลงชื่อ ...................................................... ผู้ประเมิน</div>
          <div style="font-weight: 700; white-space: nowrap; font-size: 0.82rem;">(${teachers[1].fullName || teachers[1]})</div>
          <div style="font-size: 0.75rem; color: #333; margin-top: 2px;">ตำแหน่ง ครูประจำชั้น</div>
        </div>
        <div style="text-align: center; width: 31%;">
          <div style="margin-bottom: 0.25rem; white-space: nowrap;">ลงชื่อ ...................................................... ผู้ตรวจสอบ/อนุมัติ</div>
          <div style="font-weight: 700; white-space: nowrap; font-size: 0.82rem;">(${dirName})</div>
          <div style="font-size: 0.75rem; color: #333; margin-top: 2px;">ผู้อำนวยการโรงเรียนบ้านสันดาบ</div>
        </div>
      </div>
    `;
  }

  const tName = teachers[0]?.fullName || teachers[0] || '...........................................................';
  return `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 0.75rem; page-break-inside: avoid; break-inside: avoid; font-size: 0.80rem; width: 100%; max-width: 92%; margin-left: auto; margin-right: auto;">
      <div style="text-align: center; width: 45%;">
        <div style="margin-bottom: 0.25rem; white-space: nowrap;">ลงชื่อ ............................................................ ผู้ประเมิน</div>
        <div style="font-weight: 700; white-space: nowrap; font-size: 0.84rem;">(${tName})</div>
        <div style="font-size: 0.76rem; color: #333; margin-top: 2px;">ตำแหน่ง ครูประจำชั้น</div>
      </div>
      <div style="text-align: center; width: 45%;">
        <div style="margin-bottom: 0.25rem; white-space: nowrap;">ลงชื่อ ............................................................ ผู้ตรวจสอบ/อนุมัติ</div>
        <div style="font-weight: 700; white-space: nowrap; font-size: 0.84rem;">(${dirName})</div>
        <div style="font-size: 0.76rem; color: #333; margin-top: 2px;">ผู้อำนวยการโรงเรียนบ้านสันดาบ</div>
      </div>
    </div>
  `;
}

function triggerBookletPrint(htmlContent) {
  const container = document.getElementById('print-booklet-doc');
  if (!container) {
    alert('ไม่พบส่วนแสดงผลสำหรับการพิมพ์ กรุณารีเฟรชหน้าเว็บ');
    return;
  }

  container.innerHTML = htmlContent;
  
  // Remove all other print modes
  document.body.classList.remove('printing-reading', 'printing-characteristics', 'printing-competencies', 'printing-report');
  document.body.classList.add('printing-booklet');

  const cleanUp = () => {
    document.body.classList.remove('printing-booklet');
    window.removeEventListener('afterprint', cleanUp);
  };
  window.addEventListener('afterprint', cleanUp, { once: true });

  setTimeout(() => {
    try {
      window.print();
    } catch (err) {
      console.error('Print error:', err);
      alert('เกิดข้อผิดพลาดในการสั่งพิมพ์: ' + err.message);
    }
  }, 300);
}

// ==========================================================================
// 1. เล่มแบบประเมินการอ่าน คิดวิเคราะห์ และเขียนสื่อความ
// ==========================================================================
function printBookletReading(mode = 'current') {
  const s = state.schoolInfo || {};
  const year = s.academicYear || '2569';
  const semester = s.semester || '1';
  const dirName = s.directorName || 'นายกฤษฎา ผลพล';
  const currentGrade = s.gradeLevel || 'ประถมศึกษาปีที่ 1';

  const isAll = (mode === true || mode === 'all');
  const gradesToPrint = isAll
    ? ['ประถมศึกษาปีที่ 1', 'ประถมศึกษาปีที่ 2', 'ประถมศึกษาปีที่ 3', 'ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6']
    : (currentGrade === 'ทั้งหมด' 
        ? ['ประถมศึกษาปีที่ 1', 'ประถมศึกษาปีที่ 2', 'ประถมศึกษาปีที่ 3', 'ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6']
        : [currentGrade]);

  const gradeCoverLabel = (isAll || currentGrade === 'ทั้งหมด')
    ? 'ทุกระดับชั้นเรียน (ชั้นประถมศึกษาปีที่ 1 - 6)'
    : `ชั้น${currentGrade}`;

  let docHtml = buildBookletCoverHtml(
    'แบบประเมินการอ่าน คิดวิเคราะห์ และเขียนสื่อความ',
    'ตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พุทธศักราช 2551',
    gradeCoverLabel,
    semester,
    year,
    dirName,
    (isAll || currentGrade === 'ทั้งหมด') ? 'ทั้งหมด' : currentGrade,
    'images/cover_reading.jpg'
  );

  const readingDomains = [
    {
      id: 'reading',
      num: 1,
      name: 'การอ่าน',
      title: 'สมรรถนะ / ด้านที่ 1 การอ่าน',
      indicators: [
        '1. อ่านออกเสียงร้อยแก้ว ร้อยกรองถูกต้องตามอักขรวิธีและลักษณะคำประพันธ์ได้อย่างคล่องแคล่ว',
        '2. อ่านในใจ เข้าใจความหมายของคำ สำนวน ข้อความ และจับใจความสำคัญของเรื่องที่อ่านได้',
        '3. เลือกอ่านหนังสือที่เป็นประโยชน์ทั้งความรู้ และความบันเทิง',
        '4. ตอบคำถาม สรุปสาระสำคัญ และข้อคิดจากเรื่องที่อ่านได้',
        '5. เห็นคุณค่าของการอ่านโดยการอ่านหนังสืออย่างสม่ำเสมอ มีนิสัยรักการอ่านและมีมารยาทในการอ่าน'
      ]
    },
    {
      id: 'thinking',
      num: 2,
      name: 'การคิดวิเคราะห์',
      title: 'สมรรถนะ / ด้านที่ 2 การคิดวิเคราะห์',
      indicators: [
        '1. ระบุข้อเท็จจริง ความคิดเห็นของเรื่องที่อ่านได้',
        '2. สรุปสาระสำคัญของเรื่อง บอกความสัมพันธ์สิ่งที่เกี่ยวข้องได้',
        '3. แสดงความคิดเห็นเกี่ยวกับเรื่องที่อ่านได้',
        '4. สามารถแยกผลดีและผลเสียของข้อมูลได้',
        '5. สามารถนำข้อมูลไปใช้ประโยชน์ได้'
      ]
    },
    {
      id: 'writing',
      num: 3,
      name: 'การเขียนสื่อความ',
      title: 'สมรรถนะ / ด้านที่ 3 การเขียนสื่อความ',
      indicators: [
        '1. เขียนจดหมาย เรียงความ ย่อความ สรุปความตามที่กำหนดได้',
        '2. เขียนบันทึกเรื่องราวจากประสบการณ์ เขียนตามจินตนาการได้',
        '3. เลือกใช้คำ สำนวนในการเขียนได้อย่างเหมาะสม',
        '4. ลายมือสวยงาม อ่านง่าย',
        '5. มีนิสัยรักการเขียน และมีมารยาทในการเขียน'
      ]
    }
  ];

  gradesToPrint.forEach((grade, gIdx) => {
    const studentsInGrade = state.students.filter(st => st.gradeLevel === grade);
    studentsInGrade.sort((a, b) => (Number(a.studentNumber) || 0) - (Number(b.studentNumber) || 0));

    // 1-3. Print 3 Domain Pages (ด้านที่ 1, ด้านที่ 2, ด้านที่ 3)
    readingDomains.forEach(dom => {
      let rowsHtml = '';
      if (studentsInGrade.length === 0) {
        rowsHtml = `<tr><td colspan="9" style="text-align: center; padding: 1.25rem; color: #64748b;">ไม่มีข้อมูลนักเรียนในระดับชั้นนี้</td></tr>`;
      } else {
        rowsHtml = studentsInGrade.map((st, idx) => {
          const sc = getStudentReadingScores(st.id);
          let items = [3, 3, 3, 3, 3];
          let domScore = 3;
          if (dom.id === 'reading') {
            items = sc.readingItems || [sc.item1 ?? 3, sc.item1 ?? 3, sc.item1 ?? 3, sc.item1 ?? 3, sc.item1 ?? 3];
            domScore = sc.item1 ?? calculateMode(items);
          } else if (dom.id === 'thinking') {
            items = sc.thinkingItems || [sc.item2 ?? 3, sc.item2 ?? 3, sc.item2 ?? 3, sc.item2 ?? 3, sc.item2 ?? 3];
            domScore = sc.item2 ?? calculateMode(items);
          } else {
            items = sc.writingItems || [sc.item3 ?? 3, sc.item3 ?? 3, sc.item3 ?? 3, sc.item3 ?? 3, sc.item3 ?? 3];
            domScore = sc.item3 ?? calculateMode(items);
          }

          const stNum = (st.studentNumber && String(st.studentNumber).trim() !== '' && String(st.studentNumber).trim() !== '-') ? st.studentNumber : (idx + 1);
          const stName = `${st.prefix || st.title || ''}${st.firstName || ''} ${st.lastName || ''}`.trim() || st.name || '-';

          return `
            <tr style="border-bottom: 1px solid #000;">
              <td style="border-right: 1px solid #000; text-align: center; padding: 3px 4px;">${stNum}</td>
              <td style="border-right: 1px solid #000; text-align: center; padding: 3px 4px; font-family: monospace;">${st.studentCode || '-'}</td>
              <td style="border-right: 1px solid #000; padding: 3px 8px; text-align: left; white-space: nowrap;">${stName}</td>
              <td style="border-right: 1px solid #000; text-align: center; padding: 3px 4px;">${items[0] ?? 3}</td>
              <td style="border-right: 1px solid #000; text-align: center; padding: 3px 4px;">${items[1] ?? 3}</td>
              <td style="border-right: 1px solid #000; text-align: center; padding: 3px 4px;">${items[2] ?? 3}</td>
              <td style="border-right: 1px solid #000; text-align: center; padding: 3px 4px;">${items[3] ?? 3}</td>
              <td style="border-right: 1px solid #000; text-align: center; padding: 3px 4px;">${items[4] ?? 3}</td>
              <td style="text-align: center; padding: 3px 4px; font-weight: 700; background: #fafafa;">${domScore}</td>
            </tr>
          `;
        }).join('');
      }

      const indLeft = dom.indicators.slice(0, 3);
      const indRight = dom.indicators.slice(3, 5);

      docHtml += `
        <div class="print-booklet-page print-page-break">
          ${buildBookletPageHeaderHtml('แบบประเมินการอ่าน คิดวิเคราะห์ และเขียนสื่อความ', grade, semester, year, dom.title)}

          <div style="font-size: 0.74rem; margin-bottom: 0.45rem; line-height: 1.35; background: #f8fafc; padding: 5px 10px; border: 1px solid #cbd5e1; border-radius: 4px;">
            <div style="font-weight: 700; margin-bottom: 2px; color: #1e3a8a;">รายละเอียดตัวบ่งชี้${dom.name} (5 ข้อ):</div>
            <div style="display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 2px 14px; font-size: 0.70rem; color: #334155;">
              <div>${indLeft.map(ind => `<div>${ind}</div>`).join('')}</div>
              <div>${indRight.map(ind => `<div>${ind}</div>`).join('')}</div>
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 0.80rem;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1px solid #000; font-weight: 700;">
                <th style="width: 45px; border-right: 1px solid #000; padding: 4.5px 4px; text-align: center;">เลขที่</th>
                <th style="width: 80px; border-right: 1px solid #000; padding: 4.5px 4px; text-align: center;">รหัส</th>
                <th style="border-right: 1px solid #000; padding: 4.5px 8px; text-align: left; min-width: 180px;">ชื่อ - สกุล</th>
                <th style="width: 45px; border-right: 1px solid #000; padding: 4.5px 4px; text-align: center;" title="${dom.indicators[0]}">ข้อ 1</th>
                <th style="width: 45px; border-right: 1px solid #000; padding: 4.5px 4px; text-align: center;" title="${dom.indicators[1]}">ข้อ 2</th>
                <th style="width: 45px; border-right: 1px solid #000; padding: 4.5px 4px; text-align: center;" title="${dom.indicators[2]}">ข้อ 3</th>
                <th style="width: 45px; border-right: 1px solid #000; padding: 4.5px 4px; text-align: center;" title="${dom.indicators[3]}">ข้อ 4</th>
                <th style="width: 45px; border-right: 1px solid #000; padding: 4.5px 4px; text-align: center;" title="${dom.indicators[4]}">ข้อ 5</th>
                <th style="width: 90px; padding: 4.5px 4px; text-align: center;">สรุปผล${dom.name}</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div style="margin-top: 0.5rem; font-size: 0.78rem; color: #334155;">
            <strong>เกณฑ์การประเมินรายข้อ:</strong> 3 = ดีเยี่ยม &nbsp;&nbsp; 2 = ดี &nbsp;&nbsp; 1 = ผ่านเกณฑ์ &nbsp;&nbsp; 0 = ไม่ผ่านเกณฑ์ &nbsp;&nbsp; <em>(การสรุปผลการประเมินใช้ค่า Mode)</em>
          </div>

          ${buildSingleSignatureHtml(grade)}
        </div>
      `;
    });

    // 4. Print Summary Assessment Page (ตารางสรุปผลการประเมินการอ่าน คิดวิเคราะห์ และเขียนสื่อความ ครบ 3 ด้าน)
    const stats = { excellent: 0, good: 0, pass: 0, fail: 0 };
    let summaryRowsHtml = '';

    if (studentsInGrade.length === 0) {
      summaryRowsHtml = `<tr><td colspan="8" style="text-align: center; padding: 1.25rem; color: #64748b;">ไม่มีข้อมูลนักเรียน</td></tr>`;
    } else {
      summaryRowsHtml = studentsInGrade.map((st, idx) => {
        const sc = getStudentReadingScores(st.id);
        const r1 = sc.item1 ?? 3;
        const r2 = sc.item2 ?? 3;
        const r3 = sc.item3 ?? 3;
        const sum = sc.summary ?? calculateMode([r1, r2, r3]);

        if (sum === 3) stats.excellent++;
        else if (sum === 2) stats.good++;
        else if (sum === 1) stats.pass++;
        else stats.fail++;

        const qual = getQualitativeLabel(sum);
        const stNum = (st.studentNumber && String(st.studentNumber).trim() !== '' && String(st.studentNumber).trim() !== '-') ? st.studentNumber : (idx + 1);
        const stName = `${st.prefix || st.title || ''}${st.firstName || ''} ${st.lastName || ''}`.trim() || st.name || '-';

        return `
          <tr style="border-bottom: 1px solid #000;">
            <td style="border-right: 1px solid #000; text-align: center; padding: 2.5px 3px;">${stNum}</td>
            <td style="border-right: 1px solid #000; text-align: center; padding: 2.5px 3px; font-family: monospace;">${st.studentCode || '-'}</td>
            <td style="border-right: 1px solid #000; padding: 2.5px 6px; text-align: left; white-space: nowrap;">${stName}</td>
            <td style="border-right: 1px solid #000; text-align: center; padding: 2.5px 3px;">${r1}</td>
            <td style="border-right: 1px solid #000; text-align: center; padding: 2.5px 3px;">${r2}</td>
            <td style="border-right: 1px solid #000; text-align: center; padding: 2.5px 3px;">${r3}</td>
            <td style="border-right: 1px solid #000; text-align: center; padding: 2.5px 3px; font-weight: 700;">${sum}</td>
            <td style="text-align: center; padding: 2.5px 3px; font-weight: 700; color: ${sum >= 1 ? '#15803d' : '#dc2626'};">${qual}</td>
          </tr>
        `;
      }).join('');
    }

    const isLastGrade = gIdx === gradesToPrint.length - 1;

    docHtml += `
      <div class="print-booklet-page ${isLastGrade ? '' : 'print-page-break'}">
        ${buildBookletPageHeaderHtml('สรุปผลการประเมินการอ่าน คิดวิเคราะห์ และเขียนสื่อความ', grade, semester, year, 'ตารางสรุปผลการประเมินระดับคุณภาพ')}

        <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 0.80rem;">
          <thead>
            <tr style="background: #f1f5f9; border-bottom: 1px solid #000; font-weight: 700;">
              <th style="width: 45px; border-right: 1px solid #000; padding: 4px 3px; text-align: center;" rowspan="2">เลขที่</th>
              <th style="width: 80px; border-right: 1px solid #000; padding: 4px 3px; text-align: center;" rowspan="2">รหัสประจำตัว</th>
              <th style="border-right: 1px solid #000; padding: 4px 6px; text-align: left; min-width: 170px;" rowspan="2">ชื่อ - สกุล</th>
              <th style="border-right: 1px solid #000; padding: 3px 3px; text-align: center;" colspan="3">ผลการประเมินแต่ละด้าน (3 ระดับคะแนน)</th>
              <th style="width: 75px; border-right: 1px solid #000; padding: 4px 3px; text-align: center;" rowspan="2">สรุปผล<br>(Mode)</th>
              <th style="width: 90px; padding: 4px 3px; text-align: center;" rowspan="2">ระดับคุณภาพ</th>
            </tr>
            <tr style="background: #f8fafc; border-bottom: 1px solid #000; font-size: 0.74rem;">
              <th style="width: 72px; border-right: 1px solid #000; text-align: center; padding: 3px 3px;">1. การอ่าน (3)</th>
              <th style="width: 72px; border-right: 1px solid #000; text-align: center; padding: 3px 3px;">2. คิดวิเคราะห์ (3)</th>
              <th style="width: 72px; border-right: 1px solid #000; text-align: center; padding: 3px 3px;">3. เขียนสื่อความ (3)</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRowsHtml}
          </tbody>
        </table>

        ${buildStatsTableHtml(stats, studentsInGrade.length)}
        ${buildRubricCriteriaTableHtml('reading')}
        ${buildSignaturesRowHtml(grade, dirName)}
      </div>
    `;
  });

  triggerBookletPrint(docHtml);
}

// ==========================================================================
// 2. เล่มแบบประเมินคุณลักษณะอันพึงประสงค์ (8 ประการ 80 พฤติกรรม)
// ==========================================================================
function printBookletCharacteristics(mode = 'current') {
  const s = state.schoolInfo || {};
  const year = s.academicYear || '2569';
  const semester = s.semester || '1';
  const dirName = s.directorName || 'นายกฤษฎา ผลพล';
  const currentGrade = s.gradeLevel || 'ประถมศึกษาปีที่ 1';

  const isAll = (mode === true || mode === 'all');
  const gradesToPrint = isAll
    ? ['ประถมศึกษาปีที่ 1', 'ประถมศึกษาปีที่ 2', 'ประถมศึกษาปีที่ 3', 'ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6']
    : (currentGrade === 'ทั้งหมด' 
        ? ['ประถมศึกษาปีที่ 1', 'ประถมศึกษาปีที่ 2', 'ประถมศึกษาปีที่ 3', 'ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6']
        : [currentGrade]);

  const gradeCoverLabel = (isAll || currentGrade === 'ทั้งหมด')
    ? 'ทุกระดับชั้นเรียน (ชั้นประถมศึกษาปีที่ 1 - 6)'
    : `ชั้น${currentGrade}`;

  let docHtml = buildBookletCoverHtml(
    'แบบประเมินคุณลักษณะอันพึงประสงค์ 8 ประการ',
    'ตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พุทธศักราช 2551',
    gradeCoverLabel,
    semester,
    year,
    dirName,
    (isAll || currentGrade === 'ทั้งหมด') ? 'ทั้งหมด' : currentGrade,
    'images/cover_characteristics.jpg'
  );

  const charDomains = (typeof CHARACTERISTICS_ASSESSMENT_CRITERIA !== 'undefined' && CHARACTERISTICS_ASSESSMENT_CRITERIA.domains) 
    ? CHARACTERISTICS_ASSESSMENT_CRITERIA.domains 
    : [];

  gradesToPrint.forEach((grade, gIdx) => {
    const studentsInGrade = state.students.filter(st => st.gradeLevel === grade);
    studentsInGrade.sort((a, b) => (Number(a.studentNumber) || 0) - (Number(b.studentNumber) || 0));

    // 1. หน้าทะเบียนรายชื่อนักเรียน
    let studentListRows = studentsInGrade.map((st, idx) => {
      const stNum = (st.studentNumber && String(st.studentNumber).trim() !== '' && String(st.studentNumber).trim() !== '-') ? st.studentNumber : (idx + 1);
      const stName = `${st.prefix || st.title || ''}${st.firstName || ''} ${st.lastName || ''}`.trim() || st.name || '-';
      return `
        <tr style="border-bottom: 1px solid #000;">
          <td style="border-right: 1px solid #000; text-align: center; padding: 3.5px 4px;">${stNum}</td>
          <td style="border-right: 1px solid #000; text-align: center; padding: 3.5px 4px; font-family: monospace;">${st.studentCode || '-'}</td>
          <td style="border-right: 1px solid #000; padding: 3.5px 8px; text-align: left; white-space: nowrap;">${stName}</td>
          <td style="text-align: center; padding: 3.5px 4px; color: #334155;">${st.status || 'กำลังศึกษา'}</td>
        </tr>
      `;
    }).join('');

    if (studentsInGrade.length === 0) {
      studentListRows = `<tr><td colspan="4" style="text-align: center; padding: 1.25rem; color: #64748b;">ไม่มีข้อมูลนักเรียน</td></tr>`;
    }

    docHtml += `
      <div class="print-booklet-page print-page-break">
        ${buildBookletPageHeaderHtml('ทะเบียนรายชื่อนักเรียนเพื่อการประเมินคุณลักษณะอันพึงประสงค์', grade, semester, year, 'แบบฟอร์มบันทึกรายชื่อผู้รับการประเมิน')}

        <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 0.82rem;">
          <thead>
            <tr style="background: #f1f5f9; border-bottom: 1px solid #000; font-weight: 700;">
              <th style="width: 50px; border-right: 1px solid #000; padding: 5px; text-align: center;">เลขที่</th>
              <th style="width: 90px; border-right: 1px solid #000; padding: 5px; text-align: center;">รหัสประจำตัว</th>
              <th style="border-right: 1px solid #000; padding: 5px 8px; text-align: left; min-width: 190px;">ชื่อ - นามสกุล</th>
              <th style="width: 110px; padding: 5px; text-align: center;">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            ${studentListRows}
          </tbody>
        </table>

        ${buildSingleSignatureHtml(grade)}
      </div>
    `;

    // 2. หน้ารายการประเมินพฤติกรรมบ่งชี้รายข้อ (ข้อที่ 1 ถึง 8 แยกหน้าละ 1 ข้อ พร้อมแสดงรายละเอียดพฤติกรรมบ่งชี้ 10 ข้อครบถ้วน)
    charDomains.forEach(d => {
      const domKey = d.id;
      let dRows = '';

      if (studentsInGrade.length === 0) {
        dRows = `<tr><td colspan="14" style="text-align: center; padding: 1.25rem; color: #64748b;">ไม่มีข้อมูลนักเรียนในระดับชั้นนี้</td></tr>`;
      } else {
        dRows = studentsInGrade.map((st, idx) => {
          const sc = getStudentCharacteristicsScores(st.id);
          const val = sc[domKey] ?? 3;
          const items = sc.detailItems?.[domKey] || [val, val, val, val, val, val, val, val, val, val];
          const stNum = (st.studentNumber && String(st.studentNumber).trim() !== '' && String(st.studentNumber).trim() !== '-') ? st.studentNumber : (idx + 1);
          const stName = `${st.prefix || st.title || ''}${st.firstName || ''} ${st.lastName || ''}`.trim() || st.name || '-';

          return `
            <tr style="border-bottom: 1px solid #000;">
              <td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 2px;">${stNum}</td>
              <td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 2px; font-family: monospace;">${st.studentCode || '-'}</td>
              <td style="border-right: 1px solid #000; padding: 2.2px 6px; text-align: left; white-space: nowrap;">${stName}</td>
              ${items.slice(0, 10).map(it => `<td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 1px; font-size: 0.76rem;">${it}</td>`).join('')}
              <td style="text-align: center; padding: 2.2px 2px; font-weight: 700; background: #fafafa;">${val}</td>
            </tr>
          `;
        }).join('');
      }

      const indLeft = (d.indicators || []).slice(0, 5);
      const indRight = (d.indicators || []).slice(5, 10);

      docHtml += `
        <div class="print-booklet-page print-page-break">
          ${buildBookletPageHeaderHtml('บันทึกการประเมินคุณลักษณะอันพึงประสงค์ (รายพฤติกรรมบ่งชี้)', grade, semester, year, `คุณลักษณะอันพึงประสงค์ ข้อที่ ${d.number} ${d.name}`)}

          <div style="font-size: 0.74rem; margin-bottom: 0.45rem; line-height: 1.35; background: #f8fafc; padding: 5px 10px; border: 1px solid #cbd5e1; border-radius: 4px;">
            <div style="font-weight: 700; margin-bottom: 2px; color: #1e3a8a;">
              รายละเอียดตัวบ่งชี้ข้อที่ ${d.number} ${d.name} (10 พฤติกรรมบ่งชี้):
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px 14px; font-size: 0.68rem; color: #334155;">
              <div>${indLeft.map(ind => `<div><strong>${ind.num}</strong> ${ind.text}</div>`).join('')}</div>
              <div>${indRight.map(ind => `<div><strong>${ind.num}</strong> ${ind.text}</div>`).join('')}</div>
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 0.78rem;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1px solid #000; font-weight: 700;">
                <th style="width: 38px; border-right: 1px solid #000; padding: 4px 2px; text-align: center;">เลขที่</th>
                <th style="width: 72px; border-right: 1px solid #000; padding: 4px 2px; text-align: center;">รหัส</th>
                <th style="border-right: 1px solid #000; padding: 4px 6px; text-align: left; min-width: 165px;">ชื่อ - สกุล</th>
                <th style="width: 22px; border-right: 1px solid #000; text-align: center; padding: 4px 1px;" title="${d.indicators?.[0]?.text || '1'}">1</th>
                <th style="width: 22px; border-right: 1px solid #000; text-align: center; padding: 4px 1px;" title="${d.indicators?.[1]?.text || '2'}">2</th>
                <th style="width: 22px; border-right: 1px solid #000; text-align: center; padding: 4px 1px;" title="${d.indicators?.[2]?.text || '3'}">3</th>
                <th style="width: 22px; border-right: 1px solid #000; text-align: center; padding: 4px 1px;" title="${d.indicators?.[3]?.text || '4'}">4</th>
                <th style="width: 22px; border-right: 1px solid #000; text-align: center; padding: 4px 1px;" title="${d.indicators?.[4]?.text || '5'}">5</th>
                <th style="width: 22px; border-right: 1px solid #000; text-align: center; padding: 4px 1px;" title="${d.indicators?.[5]?.text || '6'}">6</th>
                <th style="width: 22px; border-right: 1px solid #000; text-align: center; padding: 4px 1px;" title="${d.indicators?.[6]?.text || '7'}">7</th>
                <th style="width: 22px; border-right: 1px solid #000; text-align: center; padding: 4px 1px;" title="${d.indicators?.[7]?.text || '8'}">8</th>
                <th style="width: 22px; border-right: 1px solid #000; text-align: center; padding: 4px 1px;" title="${d.indicators?.[8]?.text || '9'}">9</th>
                <th style="width: 22px; border-right: 1px solid #000; text-align: center; padding: 4px 1px;" title="${d.indicators?.[9]?.text || '10'}">10</th>
                <th style="width: 70px; padding: 4px 2px; text-align: center;">สรุป (3)</th>
              </tr>
            </thead>
            <tbody>
              ${dRows}
            </tbody>
          </table>

          <div style="margin-top: 0.5rem; font-size: 0.78rem; color: #334155;">
            <strong>เกณฑ์การประเมินรายข้อ:</strong> 3 = ดีเยี่ยม &nbsp;&nbsp; 2 = ดี &nbsp;&nbsp; 1 = ผ่านเกณฑ์ &nbsp;&nbsp; 0 = ไม่ผ่านเกณฑ์ &nbsp;&nbsp; <em>(การสรุปผลการประเมินใช้ค่า Mode)</em>
          </div>

          ${buildSingleSignatureHtml(grade)}
        </div>
      `;
    });

    // 3. หน้าสรุปผลการประเมินคุณลักษณะอันพึงประสงค์ (ครบทั้ง 8 ข้อ)
    const stats = { excellent: 0, good: 0, pass: 0, fail: 0 };
    let charSummaryRows = studentsInGrade.map((st, idx) => {
      const sc = getStudentCharacteristicsScores(st.id);
      const sum = sc.summary ?? 3;

      if (sum === 3) stats.excellent++;
      else if (sum === 2) stats.good++;
      else if (sum === 1) stats.pass++;
      else stats.fail++;

      const qual = getQualitativeLabel(sum);
      const stNum = (st.studentNumber && String(st.studentNumber).trim() !== '' && String(st.studentNumber).trim() !== '-') ? st.studentNumber : (idx + 1);
      const stName = `${st.prefix || st.title || ''}${st.firstName || ''} ${st.lastName || ''}`.trim() || st.name || '-';

      return `
        <tr style="border-bottom: 1px solid #000;">
          <td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 2px;">${stNum}</td>
          <td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 2px; font-family: monospace;">${st.studentCode || '-'}</td>
          <td style="border-right: 1px solid #000; padding: 2.2px 6px; text-align: left; white-space: nowrap;">${stName}</td>
          <td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 2px;">${sc.c1 ?? 3}</td>
          <td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 2px;">${sc.c2 ?? 3}</td>
          <td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 2px;">${sc.c3 ?? 3}</td>
          <td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 2px;">${sc.c4 ?? 3}</td>
          <td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 2px;">${sc.c5 ?? 3}</td>
          <td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 2px;">${sc.c6 ?? 3}</td>
          <td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 2px;">${sc.c7 ?? 3}</td>
          <td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 2px;">${sc.c8 ?? 3}</td>
          <td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 2px; font-weight: 700; background: #fafafa;">${sum}</td>
          <td style="text-align: center; padding: 2.2px 2px; font-weight: 700; color: ${sum >= 1 ? '#15803d' : '#dc2626'};">${qual}</td>
        </tr>
      `;
    }).join('');

    if (studentsInGrade.length === 0) {
      charSummaryRows = `<tr><td colspan="13" style="text-align: center; padding: 1.25rem; color: #64748b;">ไม่มีข้อมูลนักเรียน</td></tr>`;
    }

    const isLastGrade = gIdx === gradesToPrint.length - 1;

    docHtml += `
      <div class="print-booklet-page ${isLastGrade ? '' : 'print-page-break'}">
        ${buildBookletPageHeaderHtml('สรุปผลการประเมินคุณลักษณะอันพึงประสงค์', grade, semester, year, 'ตารางสรุปผลการประเมิน 8 ประการ')}

        <div style="font-size: 0.74rem; margin-bottom: 0.35rem; line-height: 1.3; background: #f8fafc; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px;">
          <strong>คุณลักษณะ 8 ประการ:</strong> 
          1.รักชาติ ศาสน์ กษัตริย์ | 2.ซื่อสัตย์สุจริต | 3.มีวินัย | 4.ใฝ่เรียนรู้ | 5.อยู่อย่างพอเพียง | 6.มุ่งมั่นในการทำงาน | 7.รักความเป็นไทย | 8.มีจิตสาธารณะ
        </div>

        <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 0.78rem;">
          <thead>
            <tr style="background: #f1f5f9; border-bottom: 1px solid #000; font-weight: 700;">
              <th style="width: 38px; border-right: 1px solid #000; padding: 3.5px 2px; text-align: center;" rowspan="2">เลขที่</th>
              <th style="width: 72px; border-right: 1px solid #000; padding: 3.5px 2px; text-align: center;" rowspan="2">รหัส</th>
              <th style="border-right: 1px solid #000; padding: 3.5px 5px; text-align: left; min-width: 165px;" rowspan="2">ชื่อ - สกุล</th>
              <th style="border-right: 1px solid #000; padding: 2.5px 1px; text-align: center;" colspan="8">คุณลักษณะอันพึงประสงค์ข้อที่</th>
              <th style="width: 62px; border-right: 1px solid #000; padding: 3.5px 2px; text-align: center;" rowspan="2">สรุป<br>(Mode)</th>
              <th style="width: 82px; padding: 3.5px 2px; text-align: center;" rowspan="2">ระดับคุณภาพ</th>
            </tr>
            <tr style="background: #f8fafc; border-bottom: 1px solid #000; font-size: 0.72rem;">
              <th style="width: 24px; border-right: 1px solid #000; text-align: center; padding: 2.5px 1px;">1</th>
              <th style="width: 24px; border-right: 1px solid #000; text-align: center; padding: 2.5px 1px;">2</th>
              <th style="width: 24px; border-right: 1px solid #000; text-align: center; padding: 2.5px 1px;">3</th>
              <th style="width: 24px; border-right: 1px solid #000; text-align: center; padding: 2.5px 1px;">4</th>
              <th style="width: 24px; border-right: 1px solid #000; text-align: center; padding: 2.5px 1px;">5</th>
              <th style="width: 24px; border-right: 1px solid #000; text-align: center; padding: 2.5px 1px;">6</th>
              <th style="width: 24px; border-right: 1px solid #000; text-align: center; padding: 2.5px 1px;">7</th>
              <th style="width: 24px; border-right: 1px solid #000; text-align: center; padding: 2.5px 1px;">8</th>
            </tr>
          </thead>
          <tbody>
            ${charSummaryRows}
          </tbody>
        </table>

        ${buildStatsTableHtml(stats, studentsInGrade.length)}
        ${buildRubricCriteriaTableHtml('characteristics')}
        ${buildSignaturesRowHtml(grade, dirName)}
      </div>
    `;
  });

  triggerBookletPrint(docHtml);
}

// ==========================================================================
// 3. เล่มแบบประเมินสมรรถนะสำคัญผู้เรียน (5 ด้าน 25 ตัวชี้วัด)
// ==========================================================================
function printBookletCompetencies(mode = 'current') {
  const s = state.schoolInfo || {};
  const year = s.academicYear || '2569';
  const semester = s.semester || '1';
  const dirName = s.directorName || 'นายกฤษฎา ผลพล';
  const currentGrade = s.gradeLevel || 'ประถมศึกษาปีที่ 1';

  const isAll = (mode === true || mode === 'all');
  const gradesToPrint = isAll
    ? ['ประถมศึกษาปีที่ 1', 'ประถมศึกษาปีที่ 2', 'ประถมศึกษาปีที่ 3', 'ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6']
    : (currentGrade === 'ทั้งหมด' 
        ? ['ประถมศึกษาปีที่ 1', 'ประถมศึกษาปีที่ 2', 'ประถมศึกษาปีที่ 3', 'ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6']
        : [currentGrade]);

  const gradeCoverLabel = (isAll || currentGrade === 'ทั้งหมด')
    ? 'ทุกระดับชั้นเรียน (ชั้นประถมศึกษาปีที่ 1 - 6)'
    : `ชั้น${currentGrade}`;

  let docHtml = buildBookletCoverHtml(
    'แบบประเมินสมรรถนะสำคัญของผู้เรียน 5 ด้าน',
    'ตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พุทธศักราช 2551',
    gradeCoverLabel,
    semester,
    year,
    dirName,
    (isAll || currentGrade === 'ทั้งหมด') ? 'ทั้งหมด' : currentGrade,
    'images/cover_competencies.jpg'
  );

  const compDomains = (typeof COMPETENCIES_ASSESSMENT_CRITERIA !== 'undefined' && COMPETENCIES_ASSESSMENT_CRITERIA.domains)
    ? COMPETENCIES_ASSESSMENT_CRITERIA.domains
    : [];

  gradesToPrint.forEach((grade, gIdx) => {
    const studentsInGrade = state.students.filter(st => st.gradeLevel === grade);
    studentsInGrade.sort((a, b) => (Number(a.studentNumber) || 0) - (Number(b.studentNumber) || 0));

    // 1-5. หน้ารายการประเมินรายสมรรถนะ (5 ด้าน แยกหน้าละ 1 ด้าน พร้อมรายละเอียดตัวชี้วัด 5 ข้อครบถ้วน)
    compDomains.forEach(d => {
      const domKey = d.id;
      let dRows = '';

      if (studentsInGrade.length === 0) {
        dRows = `<tr><td colspan="9" style="text-align: center; padding: 1.25rem; color: #64748b;">ไม่มีข้อมูลนักเรียนในระดับชั้นนี้</td></tr>`;
      } else {
        dRows = studentsInGrade.map((st, idx) => {
          const sc = getStudentCompetenciesScores(st.id);
          const val = sc[domKey] ?? 3;
          const items = sc.detailItems?.[domKey] || [val, val, val, val, val];
          const stNum = (st.studentNumber && String(st.studentNumber).trim() !== '' && String(st.studentNumber).trim() !== '-') ? st.studentNumber : (idx + 1);
          const stName = `${st.prefix || st.title || ''}${st.firstName || ''} ${st.lastName || ''}`.trim() || st.name || '-';

          return `
            <tr style="border-bottom: 1px solid #000;">
              <td style="border-right: 1px solid #000; text-align: center; padding: 3px 4px;">${stNum}</td>
              <td style="border-right: 1px solid #000; text-align: center; padding: 3px 4px; font-family: monospace;">${st.studentCode || '-'}</td>
              <td style="border-right: 1px solid #000; padding: 3px 8px; text-align: left; white-space: nowrap;">${stName}</td>
              ${items.slice(0, 5).map(it => `<td style="border-right: 1px solid #000; text-align: center; padding: 3px 4px; font-size: 0.80rem;">${it}</td>`).join('')}
              <td style="text-align: center; padding: 3px 4px; font-weight: 700; background: #fafafa;">${val}</td>
            </tr>
          `;
        }).join('');
      }

      const indLeft = (d.indicators || []).slice(0, 3);
      const indRight = (d.indicators || []).slice(3, 5);

      docHtml += `
        <div class="print-booklet-page print-page-break">
          ${buildBookletPageHeaderHtml('การประเมินสมรรถนะสำคัญผู้เรียน (รายตัวชี้วัด)', grade, semester, year, `สมรรถนะด้านที่ ${d.number} ${d.name}`)}

          <div style="font-size: 0.74rem; margin-bottom: 0.45rem; line-height: 1.35; background: #f8fafc; padding: 5px 10px; border: 1px solid #cbd5e1; border-radius: 4px;">
            <div style="font-weight: 700; margin-bottom: 2px; color: #4338ca;">
              รายละเอียดตัวบ่งชี้ด้านที่ ${d.number} ${d.name} (5 ตัวชี้วัด):
            </div>
            <div style="display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 2px 14px; font-size: 0.70rem; color: #334155;">
              <div>${indLeft.map(ind => `<div><strong>${ind.num}</strong> ${ind.text}</div>`).join('')}</div>
              <div>${indRight.map(ind => `<div><strong>${ind.num}</strong> ${ind.text}</div>`).join('')}</div>
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 0.82rem;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1px solid #000; font-weight: 700;">
                <th style="width: 45px; border-right: 1px solid #000; padding: 4.5px 4px; text-align: center;">เลขที่</th>
                <th style="width: 80px; border-right: 1px solid #000; padding: 4.5px 4px; text-align: center;">รหัส</th>
                <th style="border-right: 1px solid #000; padding: 4.5px 8px; text-align: left; min-width: 180px;">ชื่อ - สกุล</th>
                <th style="width: 48px; border-right: 1px solid #000; text-align: center; padding: 4.5px 2px;" title="${d.indicators?.[0]?.text || '1.1'}">${d.indicators?.[0]?.num || '1.1'}</th>
                <th style="width: 48px; border-right: 1px solid #000; text-align: center; padding: 4.5px 2px;" title="${d.indicators?.[1]?.text || '1.2'}">${d.indicators?.[1]?.num || '1.2'}</th>
                <th style="width: 48px; border-right: 1px solid #000; text-align: center; padding: 4.5px 2px;" title="${d.indicators?.[2]?.text || '1.3'}">${d.indicators?.[2]?.num || '1.3'}</th>
                <th style="width: 48px; border-right: 1px solid #000; text-align: center; padding: 4.5px 2px;" title="${d.indicators?.[3]?.text || '1.4'}">${d.indicators?.[3]?.num || '1.4'}</th>
                <th style="width: 48px; border-right: 1px solid #000; text-align: center; padding: 4.5px 2px;" title="${d.indicators?.[4]?.text || '1.5'}">${d.indicators?.[4]?.num || '1.5'}</th>
                <th style="width: 90px; padding: 4.5px 4px; text-align: center;">สรุป (Mode)</th>
              </tr>
            </thead>
            <tbody>
              ${dRows}
            </tbody>
          </table>

          <div style="margin-top: 0.5rem; font-size: 0.78rem; color: #334155;">
            <strong>เกณฑ์การประเมินรายข้อ:</strong> 3 = ดีเยี่ยม &nbsp;&nbsp; 2 = ดี &nbsp;&nbsp; 1 = ผ่านเกณฑ์ &nbsp;&nbsp; 0 = ไม่ผ่านเกณฑ์ &nbsp;&nbsp; <em>(การสรุปผลใช้ค่า Mode)</em>
          </div>

          ${buildSingleSignatureHtml(grade)}
        </div>
      `;
    });

    // 4. หน้าตารางสรุปผลการประเมินสมรรถนะสำคัญผู้เรียน 5 ด้าน
    const stats = { excellent: 0, good: 0, pass: 0, fail: 0 };
    let compSummaryRows = studentsInGrade.map((st, idx) => {
      const sc = getStudentCompetenciesScores(st.id);
      const sum = sc.summary ?? 3;

      if (sum === 3) stats.excellent++;
      else if (sum === 2) stats.good++;
      else if (sum === 1) stats.pass++;
      else stats.fail++;

      const qual = getQualitativeLabel(sum);
      const stNum = (st.studentNumber && String(st.studentNumber).trim() !== '' && String(st.studentNumber).trim() !== '-') ? st.studentNumber : (idx + 1);
      const stName = `${st.prefix || st.title || ''}${st.firstName || ''} ${st.lastName || ''}`.trim() || st.name || '-';

      return `
        <tr style="border-bottom: 1px solid #000;">
          <td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 2px;">${stNum}</td>
          <td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 2px; font-family: monospace;">${st.studentCode || '-'}</td>
          <td style="border-right: 1px solid #000; padding: 2.2px 6px; text-align: left; white-space: nowrap;">${stName}</td>
          <td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 2px;">${sc.k1 ?? 3}</td>
          <td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 2px;">${sc.k2 ?? 3}</td>
          <td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 2px;">${sc.k3 ?? 3}</td>
          <td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 2px;">${sc.k4 ?? 3}</td>
          <td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 2px;">${sc.k5 ?? 3}</td>
          <td style="border-right: 1px solid #000; text-align: center; padding: 2.2px 2px; font-weight: 700; background: #fafafa;">${sum}</td>
          <td style="text-align: center; padding: 2.2px 2px; font-weight: 700; color: ${sum >= 1 ? '#15803d' : '#dc2626'};">${qual}</td>
        </tr>
      `;
    }).join('');

    if (studentsInGrade.length === 0) {
      compSummaryRows = `<tr><td colspan="10" style="text-align: center; padding: 1.25rem; color: #64748b;">ไม่มีข้อมูลนักเรียน</td></tr>`;
    }

    const isLastGrade = gIdx === gradesToPrint.length - 1;

    docHtml += `
      <div class="print-booklet-page ${isLastGrade ? '' : 'print-page-break'}">
        ${buildBookletPageHeaderHtml('สรุปผลการประเมินสมรรถนะสำคัญผู้เรียน', grade, semester, year, 'ตารางสรุปผลการประเมิน 5 ด้าน')}

        <div style="font-size: 0.74rem; margin-bottom: 0.35rem; line-height: 1.3; background: #f8fafc; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px;">
          <strong>สมรรถนะสำคัญ 5 ด้าน:</strong> 
          1. ความสามารถในการสื่อสาร | 2. ความสามารถในการคิด | 3. ความสามารถในการแก้ปัญหา | 4. ความสามารถในการใช้ทักษะชีวิต | 5. ความสามารถในการใช้เทคโนโลยี
        </div>

        <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 0.78rem;">
          <thead>
            <tr style="background: #f1f5f9; border-bottom: 1px solid #000; font-weight: 700;">
              <th style="width: 38px; border-right: 1px solid #000; padding: 3.5px 2px; text-align: center;" rowspan="2">เลขที่</th>
              <th style="width: 72px; border-right: 1px solid #000; padding: 3.5px 2px; text-align: center;" rowspan="2">รหัส</th>
              <th style="border-right: 1px solid #000; padding: 3.5px 5px; text-align: left; min-width: 165px;" rowspan="2">ชื่อ - สกุล</th>
              <th style="border-right: 1px solid #000; padding: 2.5px 2px; text-align: center;" colspan="5">สมรรถนะสำคัญ 5 ด้าน (3 ระดับคะแนน)</th>
              <th style="width: 68px; border-right: 1px solid #000; padding: 3.5px 2px; text-align: center;" rowspan="2">สรุป<br>(Mode)</th>
              <th style="width: 85px; padding: 3.5px 2px; text-align: center;" rowspan="2">ระดับคุณภาพ</th>
            </tr>
            <tr style="background: #f8fafc; border-bottom: 1px solid #000; font-size: 0.72rem;">
              <th style="width: 55px; border-right: 1px solid #000; text-align: center; padding: 2.5px 1px;">1. สื่อสาร</th>
              <th style="width: 55px; border-right: 1px solid #000; text-align: center; padding: 2.5px 1px;">2. การคิด</th>
              <th style="width: 55px; border-right: 1px solid #000; text-align: center; padding: 2.5px 1px;">3. แก้ปัญหา</th>
              <th style="width: 55px; border-right: 1px solid #000; text-align: center; padding: 2.5px 1px;">4. ทักษะชีวิต</th>
              <th style="width: 55px; border-right: 1px solid #000; text-align: center; padding: 2.5px 1px;">5. เทคโนโลยี</th>
            </tr>
          </thead>
          <tbody>
            ${compSummaryRows}
          </tbody>
        </table>

        ${buildStatsTableHtml(stats, studentsInGrade.length)}
        ${buildRubricCriteriaTableHtml('competencies')}
        ${buildSignaturesRowHtml(grade, dirName)}
      </div>
    `;
  });

  triggerBookletPrint(docHtml);
}

// ==========================================================================
// 4. เล่มสรุปรายงานผลการประเมินผู้เรียนครบทุกด้าน (ฉบับสมบูรณ์ 3 ด้าน)
// ==========================================================================
function printBookletSummaryReport(mode = 'current') {
  const s = state.schoolInfo || {};
  const year = s.academicYear || '2569';
  const semester = s.semester || '1';
  const dirName = s.directorName || 'นายกฤษฎา ผลพล';
  const currentGrade = s.gradeLevel || 'ประถมศึกษาปีที่ 1';

  const isAll = (mode === true || mode === 'all');
  const gradesToPrint = isAll
    ? ['ประถมศึกษาปีที่ 1', 'ประถมศึกษาปีที่ 2', 'ประถมศึกษาปีที่ 3', 'ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6']
    : (currentGrade === 'ทั้งหมด' 
        ? ['ประถมศึกษาปีที่ 1', 'ประถมศึกษาปีที่ 2', 'ประถมศึกษาปีที่ 3', 'ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6']
        : [currentGrade]);

  const gradeCoverLabel = (isAll || currentGrade === 'ทั้งหมด')
    ? 'ทุกระดับชั้นเรียน (ชั้นประถมศึกษาปีที่ 1 - 6)'
    : `ชั้น${currentGrade}`;

  let docHtml = buildBookletCoverHtml(
    'สรุปรายงานผลการประเมินคุณภาพผู้เรียนฉบับสมบูรณ์',
    'การอ่าน คิดวิเคราะห์ฯ • คุณลักษณะอันพึงประสงค์ 8 ประการ • สมรรถนะสำคัญ 5 ด้าน',
    gradeCoverLabel,
    semester,
    year,
    dirName,
    (isAll || currentGrade === 'ทั้งหมด') ? 'ทั้งหมด' : currentGrade,
    null
  );

  const allSchoolStats = {
    totalStudents: 0,
    grades: []
  };

  gradesToPrint.forEach((grade, idx) => {
    const studentsInGrade = state.students.filter(st => st.gradeLevel === grade);
    studentsInGrade.sort((a, b) => (Number(a.studentNumber) || 0) - (Number(b.studentNumber) || 0));

    const rStats = { excellent: 0, good: 0, pass: 0, fail: 0 };
    const cStats = { excellent: 0, good: 0, pass: 0, fail: 0 };
    const kStats = { excellent: 0, good: 0, pass: 0, fail: 0 };
    const oStats = { excellent: 0, good: 0, pass: 0, fail: 0 };

    let rowsHtml = '';
    if (studentsInGrade.length === 0) {
      rowsHtml = `<tr><td colspan="8" style="text-align: center; padding: 1.25rem; color: #64748b;">ไม่มีข้อมูลนักเรียนในระดับชั้นนี้</td></tr>`;
    } else {
      rowsHtml = studentsInGrade.map((st, sIdx) => {
        const r = state.readingAssessments[st.id]?.summary ?? 3;
        const c = state.characteristicsAssessments[st.id]?.summary ?? 3;
        const k = state.competenciesAssessments[st.id]?.summary ?? 3;

        if (r === 3) rStats.excellent++; else if (r === 2) rStats.good++; else if (r === 1) rStats.pass++; else rStats.fail++;
        if (c === 3) cStats.excellent++; else if (c === 2) cStats.good++; else if (c === 1) cStats.pass++; else cStats.fail++;
        if (k === 3) kStats.excellent++; else if (k === 2) kStats.good++; else if (k === 1) kStats.pass++; else kStats.fail++;

        let overall = 3;
        if (r === 0 || c === 0 || k === 0) overall = 0;
        else if (r === 1 || c === 1 || k === 1) overall = 1;
        else if (r === 2 || c === 2 || k === 2) overall = 2;
        else overall = 3;

        if (overall === 3) oStats.excellent++;
        else if (overall === 2) oStats.good++;
        else if (overall === 1) oStats.pass++;
        else oStats.fail++;

        const isPassed = overall >= 1;
        const qual = getQualitativeLabel(overall);
        const stNum = (st.studentNumber && String(st.studentNumber).trim() !== '' && String(st.studentNumber).trim() !== '-') ? st.studentNumber : (sIdx + 1);
        const stName = `${st.prefix || st.title || ''}${st.firstName || ''} ${st.lastName || ''}`.trim() || st.name || '-';

        return `
          <tr style="border-bottom: 1px solid #000;">
            <td style="border-right: 1px solid #000; text-align: center; padding: 2.5px 3px;">${stNum}</td>
            <td style="border-right: 1px solid #000; text-align: center; padding: 2.5px 3px; font-family: monospace;">${st.studentCode || '-'}</td>
            <td style="border-right: 1px solid #000; padding: 2.5px 6px; text-align: left; white-space: nowrap;">${stName}</td>
            <td style="border-right: 1px solid #000; text-align: center; padding: 2.5px 3px;">${getQualitativeLabel(r)} (${r})</td>
            <td style="border-right: 1px solid #000; text-align: center; padding: 2.5px 3px;">${getQualitativeLabel(c)} (${c})</td>
            <td style="border-right: 1px solid #000; text-align: center; padding: 2.5px 3px;">${getQualitativeLabel(k)} (${k})</td>
            <td style="border-right: 1px solid #000; text-align: center; padding: 2.5px 3px; font-weight: 700;">${qual} (${overall})</td>
            <td style="text-align: center; padding: 2.5px 3px; font-weight: 700; color: ${isPassed ? '#15803d' : '#dc2626'};">
              ${isPassed ? 'ผ่านเกณฑ์' : 'ไม่ผ่านเกณฑ์'}
            </td>
          </tr>
        `;
      }).join('');
    }

    allSchoolStats.totalStudents += studentsInGrade.length;
    allSchoolStats.grades.push({
      grade,
      count: studentsInGrade.length,
      rPass: rStats.excellent + rStats.good + rStats.pass,
      cPass: cStats.excellent + cStats.good + cStats.pass,
      kPass: kStats.excellent + kStats.good + kStats.pass,
      oPass: oStats.excellent + oStats.good + oStats.pass,
      oExcellent: oStats.excellent
    });

    const isLast = (idx === gradesToPrint.length - 1) && (!isAll);

    docHtml += `
      <div class="print-booklet-page ${isLast ? '' : 'print-page-break'}">
        ${buildBookletPageHeaderHtml('ตารางสรุปผลการประเมินคุณภาพผู้เรียนรายบุคคลฉบับสมบูรณ์ (ครบ 3 ด้าน)', grade, semester, year)}

        <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 0.78rem;">
          <thead>
            <tr style="background: #f1f5f9; border-bottom: 1px solid #000; font-weight: 700;">
              <th style="width: 38px; border-right: 1px solid #000; padding: 3.5px 2px; text-align: center;">เลขที่</th>
              <th style="width: 72px; border-right: 1px solid #000; padding: 3.5px 2px; text-align: center;">รหัส</th>
              <th style="border-right: 1px solid #000; padding: 3.5px 6px; text-align: left; min-width: 165px;">ชื่อ - นามสกุล</th>
              <th style="width: 90px; border-right: 1px solid #000; padding: 3.5px 2px; text-align: center;">1. การอ่านฯ</th>
              <th style="width: 90px; border-right: 1px solid #000; padding: 3.5px 2px; text-align: center;">2. คุณลักษณะฯ</th>
              <th style="width: 90px; border-right: 1px solid #000; padding: 3.5px 2px; text-align: center;">3. สมรรถนะฯ</th>
              <th style="width: 85px; border-right: 1px solid #000; padding: 3.5px 2px; text-align: center;">สรุปผลภาพรวม</th>
              <th style="width: 80px; padding: 3.5px 2px; text-align: center;">ผลการตัดสิน</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        ${buildMultiDomainStatsTableHtml(rStats, cStats, kStats, oStats, studentsInGrade.length)}
        ${buildSignaturesRowHtml(grade, dirName)}
      </div>
    `;
  });

  // If printing All Grades Booklet, append School Summary Report Matrix and Conclusion
  if (isAll || currentGrade === 'ทั้งหมด') {
    docHtml += `
      <div class="print-booklet-page">
        ${buildBookletPageHeaderHtml('ตารางสรุปผลการประเมินภาพรวมทั้งสถานศึกษา (เปรียบเทียบทุกระดับชั้น)', 'ทุกระดับชั้นเรียน (ชั้นประถมศึกษาปีที่ 1 - 6)', semester, year)}

        <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 0.82rem; margin-bottom: 1.0rem;">
          <thead>
            <tr style="background: #f1f5f9; border-bottom: 1px solid #000; font-weight: 700;">
              <th style="border-right: 1px solid #000; padding: 6px 8px; text-align: center;" rowspan="2">ระดับชั้น</th>
              <th style="width: 70px; border-right: 1px solid #000; padding: 6px 6px; text-align: center;" rowspan="2">จำนวนนักเรียน</th>
              <th style="border-right: 1px solid #000; padding: 4px 6px; text-align: center;" colspan="3">ร้อยละของผู้เรียนที่ผ่านเกณฑ์การประเมิน (ระดับดีขึ้นไป)</th>
              <th style="width: 110px; padding: 6px 8px; text-align: center;" rowspan="2">สรุปภาพรวม<br>ผ่านเกณฑ์ (%)</th>
            </tr>
            <tr style="background: #f8fafc; border-bottom: 1px solid #000; font-size: 0.76rem;">
              <th style="width: 110px; border-right: 1px solid #000; text-align: center; padding: 4px 6px;">1. การอ่านฯ</th>
              <th style="width: 110px; border-right: 1px solid #000; text-align: center; padding: 4px 6px;">2. คุณลักษณะฯ</th>
              <th style="width: 110px; border-right: 1px solid #000; text-align: center; padding: 4px 6px;">3. สมรรถนะฯ</th>
            </tr>
          </thead>
          <tbody>
            ${allSchoolStats.grades.map(g => {
              const rPct = g.count > 0 ? ((g.rPass / g.count) * 100).toFixed(2) : '100.00';
              const cPct = g.count > 0 ? ((g.cPass / g.count) * 100).toFixed(2) : '100.00';
              const kPct = g.count > 0 ? ((g.kPass / g.count) * 100).toFixed(2) : '100.00';
              const oPct = g.count > 0 ? ((g.oPass / g.count) * 100).toFixed(2) : '100.00';
              return `
                <tr style="border-bottom: 1px solid #000;">
                  <td style="border-right: 1px solid #000; padding: 4px 10px; font-weight: 600;">${g.grade}</td>
                  <td style="border-right: 1px solid #000; text-align: center; padding: 4px 6px;">${g.count} คน</td>
                  <td style="border-right: 1px solid #000; text-align: center; padding: 4px 6px;">${rPct}%</td>
                  <td style="border-right: 1px solid #000; text-align: center; padding: 4px 6px;">${cPct}%</td>
                  <td style="border-right: 1px solid #000; text-align: center; padding: 4px 6px;">${kPct}%</td>
                  <td style="text-align: center; padding: 4px 6px; font-weight: 700; color: #15803d; background: #f0fdf4;">${oPct}%</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0.8rem 1.0rem; font-size: 0.80rem; line-height: 1.5; color: #1e293b; margin-top: 0.8rem;">
          <div style="font-weight: 700; font-size: 0.88rem; margin-bottom: 0.25rem; color: #1e3a8a;">
            <i class="fa-solid fa-circle-check" style="color: #10b981;"></i> ข้อสรุปผลการประเมินและการรับรองผล
          </div>
          <p style="margin: 0 0 0.3rem 0; text-indent: 1.25rem;">
            คณะกรรมการประเมินได้ดำเนินการประเมินพัฒนาการคุณภาพผู้เรียนตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พุทธศักราช 2551 ครบถ้วนทั้ง 3 ด้าน ผลการประเมินเป็นไปตามเกณฑ์มาตรฐานของสถานศึกษาและสำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน
          </p>
          <p style="margin: 0; text-indent: 1.25rem;">
            จึงขอรับรองว่ารายงานผลการประเมินฉบับนี้ถูกต้องตามความเป็นจริงทุกประการ
          </p>
        </div>

        <div style="margin-top: 1.8rem; display: flex; justify-content: space-around; font-size: 0.84rem;">
          <div style="text-align: center; width: 44%;">
            <div style="margin-bottom: 0.35rem;">ลงชื่อ ........................................................... หัวหน้างานวัดและประเมินผล</div>
            <div style="font-weight: 700;">(นางสาวสุวรรณี นิลประดับ)</div>
            <div style="font-size: 0.78rem; color: #333; margin-top: 2px;">หัวหน้าฝ่ายวิชาการ</div>
          </div>
          <div style="text-align: center; width: 44%;">
            <div style="margin-bottom: 0.35rem;">ลงชื่อ ........................................................... ผู้อนุมัติผลการประเมิน</div>
            <div style="font-weight: 700;">(${dirName || 'นายกฤษฎา ผลพล'})</div>
            <div style="font-size: 0.78rem; color: #333; margin-top: 2px;">ผู้อำนวยการโรงเรียนบ้านสันดาบ</div>
          </div>
        </div>
      </div>
    `;
  }

  triggerBookletPrint(docHtml);
}


/* ==========================================================================
   14. Admin Control Center & System Management Functions
   ========================================================================== */

let adminTargetGrade = 'ทั้งหมด';

function updateAdminTargetGrade(val) {
  adminTargetGrade = val || 'ทั้งหมด';
  const hint = document.getElementById('admin-target-grade-hint');
  const count = (adminTargetGrade === 'ทั้งหมด') 
    ? (state.students ? state.students.length : 0) 
    : (state.students ? state.students.filter(st => st.gradeLevel === adminTargetGrade).length : 0);
  
  if (hint) {
    const label = (adminTargetGrade === 'ทั้งหมด') ? 'นักเรียนทุกคนในระบบ' : `ชั้น ${adminTargetGrade}`;
    hint.textContent = `* คำสั่งล้างคะแนนหรือให้คะแนนกลุ่มจะมีผลกับ ${label} (${count} คน)`;
  }
}

function getAdminTargetStudents() {
  if (!state.students || !Array.isArray(state.students)) return [];
  if (adminTargetGrade === 'ทั้งหมด') {
    return state.students;
  }
  return state.students.filter(st => st.gradeLevel === adminTargetGrade);
}

function openAdminModal() {
  const modal = document.getElementById('admin-modal');
  if (modal) modal.classList.add('open');
}

function closeAdminModal() {
  const modal = document.getElementById('admin-modal');
  if (modal) modal.classList.remove('open');
}

// 1. ล้างคะแนนการอ่าน คิดวิเคราะห์ฯ
function adminClearReadingScoresFromTarget() {
  const targetStudents = getAdminTargetStudents();
  if (targetStudents.length === 0) {
    showToast('ไม่มีนักเรียนในระดับชั้นที่เลือก', 'warning');
    return;
  }
  const label = (adminTargetGrade === 'ทั้งหมด') ? 'นักเรียนทุกคนในระบบ (ทุกระดับชั้น ป.1-ป.6)' : `ชั้น ${adminTargetGrade}`;
  if (confirm(`คุณต้องการล้างคะแนนแบบประเมิน "การอ่าน คิดวิเคราะห์ และเขียนสื่อความ" ของ ${label} (${targetStudents.length} คน) ใช่หรือไม่?\n\n* ข้อมูลส่วนอื่นและรายชื่อนักเรียนจะไม่ได้รับผลกระทบ *`)) {
    targetStudents.forEach(st => {
      if (state.readingAssessments) {
        delete state.readingAssessments[st.id];
      }
    });
    saveData(true);
    renderAll();
    showToast(`ล้างคะแนนการอ่าน คิดวิเคราะห์ฯ ของ ${label} เรียบร้อยแล้ว`, 'success');
  }
}

function adminClearReadingScores() {
  adminClearReadingScoresFromTarget();
}

// 2. ล้างคะแนนคุณลักษณะอันพึงประสงค์
function adminClearCharScoresFromTarget() {
  const targetStudents = getAdminTargetStudents();
  if (targetStudents.length === 0) {
    showToast('ไม่มีนักเรียนในระดับชั้นที่เลือก', 'warning');
    return;
  }
  const label = (adminTargetGrade === 'ทั้งหมด') ? 'นักเรียนทุกคนในระบบ (ทุกระดับชั้น ป.1-ป.6)' : `ชั้น ${adminTargetGrade}`;
  if (confirm(`คุณต้องการล้างคะแนนแบบประเมิน "คุณลักษณะอันพึงประสงค์ (8 ด้าน 80 ข้อ)" ของ ${label} (${targetStudents.length} คน) ใช่หรือไม่?\n\n* ข้อมูลส่วนอื่นและรายชื่อนักเรียนจะไม่ได้รับผลกระทบ *`)) {
    targetStudents.forEach(st => {
      if (state.characteristicsAssessments) {
        delete state.characteristicsAssessments[st.id];
      }
    });
    saveData(true);
    renderAll();
    showToast(`ล้างคะแนนคุณลักษณะอันพึงประสงค์ของ ${label} เรียบร้อยแล้ว`, 'success');
  }
}

function adminClearCharScores() {
  adminClearCharScoresFromTarget();
}

// 3. ล้างคะแนนสมรรถนะสำคัญผู้เรียน
function adminClearCompScoresFromTarget() {
  const targetStudents = getAdminTargetStudents();
  if (targetStudents.length === 0) {
    showToast('ไม่มีนักเรียนในระดับชั้นที่เลือก', 'warning');
    return;
  }
  const label = (adminTargetGrade === 'ทั้งหมด') ? 'นักเรียนทุกคนในระบบ (ทุกระดับชั้น ป.1-ป.6)' : `ชั้น ${adminTargetGrade}`;
  if (confirm(`คุณต้องการล้างคะแนนแบบประเมิน "สมรรถนะสำคัญผู้เรียน (5 ด้าน 25 ข้อ)" ของ ${label} (${targetStudents.length} คน) ใช่หรือไม่?\n\n* ข้อมูลส่วนอื่นและรายชื่อนักเรียนจะไม่ได้รับผลกระทบ *`)) {
    targetStudents.forEach(st => {
      if (state.competenciesAssessments) {
        delete state.competenciesAssessments[st.id];
      }
    });
    saveData(true);
    renderAll();
    showToast(`ล้างคะแนนสมรรถนะสำคัญผู้เรียนของ ${label} เรียบร้อยแล้ว`, 'success');
  }
}

function adminClearCompScores() {
  adminClearCompScoresFromTarget();
}

// 4. ล้างคะแนนประเมินทั้ง 3 ด้าน
function adminClearAllScoresFromTarget() {
  const targetStudents = getAdminTargetStudents();
  if (targetStudents.length === 0) {
    showToast('ไม่มีนักเรียนในระดับชั้นที่เลือก', 'warning');
    return;
  }
  const label = (adminTargetGrade === 'ทั้งหมด') ? 'นักเรียนทุกคนในระบบ (ทุกระดับชั้น ป.1-ป.6)' : `ชั้น ${adminTargetGrade}`;
  if (confirm(`คุณต้องการล้างคะแนนแบบประเมิน "ทั้ง 3 ด้าน" ของ ${label} (${targetStudents.length} คน) ใช่หรือไม่?\n\n* รายชื่อนักเรียนและข้อมูลครูจะยังคงอยู่ *`)) {
    targetStudents.forEach(st => {
      if (state.readingAssessments) delete state.readingAssessments[st.id];
      if (state.characteristicsAssessments) delete state.characteristicsAssessments[st.id];
      if (state.competenciesAssessments) delete state.competenciesAssessments[st.id];
    });
    saveData(true);
    renderAll();
    showToast(`ล้างคะแนนแบบประเมินทั้ง 3 ด้านของ ${label} เรียบร้อยแล้ว`, 'success');
  }
}

function adminClearAllScores() {
  adminClearAllScoresFromTarget();
}

// 5. ล้างรายชื่อนักเรียนทั้งหมด
function adminClearStudents() {
  if (confirm(`⚠️ คำเตือนความปลอดภัย:\nคุณต้องการล้างข้อมูลนักเรียนทั้งหมดในระบบ (${state.students.length} คน) และคะแนนประเมินทั้งหมดใช่หรือไม่?\n\n* การดำ��นการนี้ไม่สามารถย้อนกลับได้ *`)) {
    state.students = [];
    state.readingAssessments = {};
    state.characteristicsAssessments = {};
    state.competenciesAssessments = {};
    saveData(true);
    renderAll();
    showToast('ล้างข้อมูลนักเรียนทั้งหมดเรียบร้อยแล้ว', 'info');
  }
}

// 6. รีเซ็ตระบบคืนค่าเริ่มต้นทางการ (Factory Reset)
function adminFactoryReset() {
  if (confirm('🔄 คุณต้องการรีเซ็ตระบบกลับสู่ค่าเริ่มต้นอย่างเป็นทางการ (นักเรียน 101 คน ครบ ป.1-ป.6 พร้อมคะแนนสมบูรณ์และรายชื่อครูทางการของโรงเรียนบ้านสันดาบ) ใช่หรือไม่?')) {
    state = JSON.parse(JSON.stringify(DEFAULT_APP_DATA));
    saveData(true);
    renderAll();
    closeAdminModal();
    showToast('รีเซ็ตระบบสู่ค่าเริ่มต้นอย่างเป็นทางการเรียบร้อยแล้ว', 'success');
  }
}

// 7. กู้คืนฐานข้อมูล
function adminRestoreData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed.students && Array.isArray(parsed.students)) {
        state = parsed;
        saveData(true);
        renderAll();
        closeAdminModal();
        showToast('กู้คืนฐานข้อมูลจากไฟล์ JSON สำเร็จแล้ว', 'success');
      } else {
        alert('ไฟล์ JSON ไม่ถูกต้องตามรูปแบบโครงสร้างข้อมูลของระบบ');
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการอ่านไฟล์ JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// 8. บันทึกคะแนนกลุ่ม (Batch Scoring)
function adminSetAllScoresFromTarget(scoreVal) {
  const scoreNum = Number(scoreVal) || 3;
  const targetStudents = getAdminTargetStudents();

  if (targetStudents.length === 0) {
    showToast('ไม่มีนักเรียนในระดับชั้นที่เลือก', 'warning');
    return;
  }

  const scoreLabel = scoreNum === 3 ? 'ดีเยี่ยม (3)' : (scoreNum === 2 ? 'ดี (2)' : `${scoreNum}`);
  const targetLabel = (adminTargetGrade === 'ทั้งหมด') ? 'นักเรียนทุกคนในระบบ (ทุกระดับชั้น ป.1-ป.6)' : `นักเรียนชั้น ${adminTargetGrade}`;

  if (confirm(`คุณต้องการบันทึกคะแนน ${scoreLabel} ให้กับ ${targetLabel} (${targetStudents.length} คน) ในแบบประเมินทั้ง 3 ด้านใช่หรือไม่?`)) {
    if (!state.readingAssessments) state.readingAssessments = {};
    if (!state.characteristicsAssessments) state.characteristicsAssessments = {};
    if (!state.competenciesAssessments) state.competenciesAssessments = {};

    targetStudents.forEach(st => {
      // 1. Reading
      state.readingAssessments[st.id] = {
        item1: scoreNum,
        item2: scoreNum,
        item3: scoreNum,
        readingItems: [scoreNum, scoreNum, scoreNum, scoreNum, scoreNum],
        thinkingItems: [scoreNum, scoreNum, scoreNum, scoreNum, scoreNum],
        writingItems: [scoreNum, scoreNum, scoreNum, scoreNum, scoreNum],
        summary: scoreNum,
        note: ''
      };

      // 2. Characteristics
      const tenArr = [scoreNum, scoreNum, scoreNum, scoreNum, scoreNum, scoreNum, scoreNum, scoreNum, scoreNum, scoreNum];
      state.characteristicsAssessments[st.id] = {
        c1: scoreNum, c2: scoreNum, c3: scoreNum, c4: scoreNum,
        c5: scoreNum, c6: scoreNum, c7: scoreNum, c8: scoreNum,
        detailItems: {
          c1: [...tenArr], c2: [...tenArr], c3: [...tenArr], c4: [...tenArr],
          c5: [...tenArr], c6: [...tenArr], c7: [...tenArr], c8: [...tenArr]
        },
        summary: scoreNum,
        note: ''
      };

      // 3. Competencies
      const fiveArr = [scoreNum, scoreNum, scoreNum, scoreNum, scoreNum];
      state.competenciesAssessments[st.id] = {
        k1: scoreNum, k2: scoreNum, k3: scoreNum, k4: scoreNum, k5: scoreNum,
        detailItems: {
          k1: [...fiveArr], k2: [...fiveArr], k3: [...fiveArr], k4: [...fiveArr], k5: [...fiveArr]
        },
        summary: scoreNum,
        note: ''
      };
    });

    saveData(true);
    renderAll();
    showToast(`บันทึกคะแนน ${scoreLabel} ให้กับ ${targetLabel} เรียบร้อยแล้ว`, 'success');
  }
}

function adminSetAllScores(scoreVal) {
  adminSetAllScoresFromTarget(scoreVal);
}

// 9. สุ่มคะแนนตัวอย่างสมจริง (Random Simulation Scores)
function adminRandomSimulationScoresFromTarget() {
  const targetStudents = getAdminTargetStudents();
  if (targetStudents.length === 0) {
    showToast('ไม่มีนักเรียนในระดับชั้นที่เลือก', 'warning');
    return;
  }

  const targetLabel = (adminTargetGrade === 'ทั้งหมด') ? 'นักเรียนทุกคนในระบบ (ทุกระดับชั้น ป.1-ป.6)' : `นักเรียนชั้น ${adminTargetGrade}`;

  if (confirm(`คุณต้องการสุ่มคะแนนตัวอย่างสมจริง (คะแนน 3 ดีเยี่ยม และ 2 ดี ผสมตามเกณฑ์มาตรฐาน) ให้กับ ${targetLabel} (${targetStudents.length} คน) ใช่หรือไม่?`)) {
    if (!state.readingAssessments) state.readingAssessments = {};
    if (!state.characteristicsAssessments) state.characteristicsAssessments = {};
    if (!state.competenciesAssessments) state.competenciesAssessments = {};

    targetStudents.forEach(st => {
      // 1. Reading
      const rItems = [0, 1, 2, 3, 4].map(() => Math.random() < 0.75 ? 3 : 2);
      const tItems = [0, 1, 2, 3, 4].map(() => Math.random() < 0.75 ? 3 : 2);
      const wItems = [0, 1, 2, 3, 4].map(() => Math.random() < 0.7 ? 3 : 2);
      const r1 = calculateMode(rItems);
      const r2 = calculateMode(tItems);
      const r3 = calculateMode(wItems);
      const rSum = calculateMode([r1, r2, r3]);

      state.readingAssessments[st.id] = {
        item1: r1,
        item2: r2,
        item3: r3,
        readingItems: rItems,
        thinkingItems: tItems,
        writingItems: wItems,
        summary: rSum,
        note: ''
      };

      // 2. Characteristics
      const gen10 = () => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(() => Math.random() < 0.8 ? 3 : 2);
      const dItems = {
        c1: gen10(), c2: gen10(), c3: gen10(), c4: gen10(),
        c5: gen10(), c6: gen10(), c7: gen10(), c8: gen10()
      };
      const c1 = calculateMode(dItems.c1);
      const c2 = calculateMode(dItems.c2);
      const c3 = calculateMode(dItems.c3);
      const c4 = calculateMode(dItems.c4);
      const c5 = calculateMode(dItems.c5);
      const c6 = calculateMode(dItems.c6);
      const c7 = calculateMode(dItems.c7);
      const c8 = calculateMode(dItems.c8);
      const cSum = calculateMode([c1, c2, c3, c4, c5, c6, c7, c8]);

      state.characteristicsAssessments[st.id] = {
        c1, c2, c3, c4, c5, c6, c7, c8,
        detailItems: dItems,
        summary: cSum,
        note: ''
      };

      // 3. Competencies
      const gen5 = () => [0, 1, 2, 3, 4].map(() => Math.random() < 0.8 ? 3 : 2);
      const compDetails = {
        k1: gen5(), k2: gen5(), k3: gen5(), k4: gen5(), k5: gen5()
      };
      const k1 = calculateMode(compDetails.k1);
      const k2 = calculateMode(compDetails.k2);
      const k3 = calculateMode(compDetails.k3);
      const k4 = calculateMode(compDetails.k4);
      const k5 = calculateMode(compDetails.k5);
      const kSum = calculateMode([k1, k2, k3, k4, k5]);

      state.competenciesAssessments[st.id] = {
        k1, k2, k3, k4, k5,
        detailItems: compDetails,
        summary: kSum,
        note: ''
      };
    });

    saveData(true);
    renderAll();
    showToast(`สุ่มคะแนนตัวอย่างสมจริงให้กับ ${targetLabel} เรียบร้อยแล้ว`, 'success');
  }
}

// 10. อัปเดตข้อมูลบนหน้า Admin Control Center Dashboard
function renderAdminDashboard() {
  const totalStudents = state.students ? state.students.length : 0;
  const totalTeachers = state.teachers ? state.teachers.length : 0;
  
  let assessedStudents = 0;
  if (state.students && state.students.length > 0) {
    state.students.forEach(st => {
      const hasR = state.readingAssessments && state.readingAssessments[st.id];
      const hasC = state.characteristicsAssessments && state.characteristicsAssessments[st.id];
      const hasK = state.competenciesAssessments && state.competenciesAssessments[st.id];
      if (hasR && hasC && hasK) assessedStudents++;
    });
  }
  const pct = totalStudents > 0 ? Math.round((assessedStudents / totalStudents) * 100) : 0;

  const stCountEl = document.getElementById('admin-stat-students-count');
  const tchCountEl = document.getElementById('admin-stat-teachers-count');
  const progressEl = document.getElementById('admin-stat-eval-progress');

  if (stCountEl) stCountEl.textContent = `${totalStudents} คน`;
  if (tchCountEl) tchCountEl.textContent = `${totalTeachers} ท่าน`;
  if (progressEl) progressEl.textContent = `${pct}%`;

  if (window.cloudApi) {
    window.cloudApi.updateStatusUI();
  }
}

// 11. ดาวน์โหลดชุด Excel ทุกเล่ม
function downloadExcelAllBooklets() {
  downloadAllAssessmentsExcel();
}

/* ==========================================================================
   15. Excel (.xlsx) Download & Export Engine (SheetJS)
   ========================================================================== */

function checkSheetJsLoaded() {
  if (typeof XLSX === 'undefined') {
    alert('ระบบกำลังโหลดโมดูลสร้างไฟล์ Excel กรุณาลองใหม่อีกครั้งในครู่เดียว');
    return false;
  }
  return true;
}

function getGradeListForExport(mode) {
  const currentGrade = state.schoolInfo?.gradeLevel || 'ประถมศึกษาปีที่ 1';
  if (mode === 'all' || currentGrade === 'ทั้งหมด') {
    return ['ประถมศึกษาปีที่ 1', 'ประถมศึกษาปีที่ 2', 'ประถมศึกษาปีที่ 3', 'ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6'];
  }
  return [currentGrade];
}

// 1. ดาวน์โหลด Excel แบบประเมินการอ่าน คิดวิเคราะห์ และเขียนสื่อความ
function downloadExcelReading(mode = 'current') {
  if (!checkSheetJsLoaded()) return;

  const s = state.schoolInfo || {};
  const year = s.academicYear || '2569';
  const semester = s.semester || '1';
  const semText = semester === 'ตลอดปีการศึกษา' ? 'ตลอดปีการศึกษา' : `ภาคเรียนที่ ${semester}`;
  const dirName = s.directorName || 'นายกฤษฎา ผลพล';
  const currentGrade = s.gradeLevel || 'ประถมศึกษาปีที่ 1';
  const grades = getGradeListForExport(mode);

  const wb = XLSX.utils.book_new();

  grades.forEach(grade => {
    const shortG = formatShortGrade(grade);
    const studentsInGrade = state.students.filter(st => st.gradeLevel === grade);
    studentsInGrade.sort((a, b) => (Number(a.studentNumber) || 0) - (Number(b.studentNumber) || 0));
    const teacherName = getGradeTeacherName(grade);

    const data = [
      ['แบบประเมินการอ่าน คิดวิเคราะห์ และเขียนสื่อความ'],
      ['โรงเรียนบ้านสันดาบ สังกัดสำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร'],
      [`ระดับชั้น${grade}`, `${semText}`, `ปีการศึกษา ${year}`],
      [`ครูประจำชั้น: ${teacherName}`, `ผู้อำนวยการ: ${dirName}`],
      [],
      ['เลขที่', 'รหัสนักเรียน', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', '1.การอ่าน (3)', '2.การคิดวิเคราะห์ (3)', '3.การเขียนสื่อความ (3)', 'สรุปผล (Mode)', 'ระดับคุณภาพ']
    ];

    const stats = { excellent: 0, good: 0, pass: 0, fail: 0 };

    studentsInGrade.forEach(st => {
      const sc = getStudentReadingScores(st.id);
      const r1 = sc.item1 ?? 3;
      const r2 = sc.item2 ?? 3;
      const r3 = sc.item3 ?? 3;
      const sum = sc.summary ?? calculateMode([r1, r2, r3]);

      if (sum === 3) stats.excellent++;
      else if (sum === 2) stats.good++;
      else if (sum === 1) stats.pass++;
      else stats.fail++;

      data.push([
        st.studentNumber || '',
        st.studentCode || '',
        st.title || '',
        st.firstName || '',
        st.lastName || '',
        r1,
        r2,
        r3,
        sum,
        getQualitativeLabel(sum)
      ]);
    });

    const total = studentsInGrade.length;
    const passGood = stats.excellent + stats.good;
    data.push([]);
    data.push(['สรุปผลการประเมิน', '', '', '', 'ระดับคุณภาพ', 'ดีเยี่ยม (3)', 'ดี (2)', 'ผ่าน (1)', 'ไม่ผ่าน (0)', 'ระดับดีขึ้นไป']);
    data.push(['จำนวนนักเรียนทั้งหมด', `${total} คน`, '', '', 'จำนวน (คน)', stats.excellent, stats.good, stats.pass, stats.fail, passGood]);
    data.push(['', '', '', '', 'ร้อยละ (%)', 
      total > 0 ? ((stats.excellent / total) * 100).toFixed(2) + '%' : '0.00%',
      total > 0 ? ((stats.good / total) * 100).toFixed(2) + '%' : '0.00%',
      total > 0 ? ((stats.pass / total) * 100).toFixed(2) + '%' : '0.00%',
      total > 0 ? ((stats.fail / total) * 100).toFixed(2) + '%' : '0.00%',
      total > 0 ? ((passGood / total) * 100).toFixed(2) + '%' : '0.00%'
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 18 }, { wch: 18 },
      { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 16 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, shortG);
  });

  const fileName = (mode === 'all' || currentGrade === 'ทั้งหมด')
    ? `แบบประเมินการอ่าน_โรงเรียนบ้านสันดาบ_รวมทุกชั้น_${year}.xlsx`
    : `แบบประเมินการอ่าน_โรงเรียนบ้านสันดาบ_${formatShortGrade(currentGrade)}_${year}.xlsx`;

  XLSX.writeFile(wb, fileName);
  showToast(`ดาวน์โหลดไฟล์ Excel: ${fileName} เรียบร้อยแล้ว`, 'success');
}

// 2. ดาวน์โหลด Excel แบบประเมินคุณลักษณะอันพึงประสงค์ (8 ประการ)
function downloadExcelCharacteristics(mode = 'current') {
  if (!checkSheetJsLoaded()) return;

  const s = state.schoolInfo || {};
  const year = s.academicYear || '2569';
  const semester = s.semester || '1';
  const semText = semester === 'ตลอดปีการศึกษา' ? 'ตลอดปีการศึกษา' : `ภาคเรียนที่ ${semester}`;
  const dirName = s.directorName || 'นายกฤษฎา ผลพล';
  const currentGrade = s.gradeLevel || 'ประถมศึกษาปีที่ 1';
  const grades = getGradeListForExport(mode);

  const wb = XLSX.utils.book_new();

  grades.forEach(grade => {
    const shortG = formatShortGrade(grade);
    const studentsInGrade = state.students.filter(st => st.gradeLevel === grade);
    studentsInGrade.sort((a, b) => (Number(a.studentNumber) || 0) - (Number(b.studentNumber) || 0));
    const teacherName = getGradeTeacherName(grade);

    const data = [
      ['แบบประเมินคุณลักษณะอันพึงประสงค์ 8 ประการ'],
      ['โรงเรียนบ้านสันดาบ สังกัดสำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร'],
      [`ระดับชั้น${grade}`, `${semText}`, `ปีการศึกษา ${year}`],
      [`ครูประจำชั้น: ${teacherName}`, `ผู้อำนวยการ: ${dirName}`],
      [],
      ['เลขที่', 'รหัสนักเรียน', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', '1.รักชาติฯ', '2.ซื่อสัตย์ฯ', '3.มีวินัย', '4.ใฝ่เรียนรู้', '5.พอเพียง', '6.มุ่งมั่นฯ', '7.รักไทย', '8.จิตสาธารณะ', 'คะแนนสรุป', 'ระดับคุณภาพ']
    ];

    const stats = { excellent: 0, good: 0, pass: 0, fail: 0 };

    studentsInGrade.forEach(st => {
      const sc = getStudentCharacteristicsScores(st.id);
      const sum = sc.summary ?? 3;

      if (sum === 3) stats.excellent++;
      else if (sum === 2) stats.good++;
      else if (sum === 1) stats.pass++;
      else stats.fail++;

      data.push([
        st.studentNumber || '',
        st.studentCode || '',
        st.title || '',
        st.firstName || '',
        st.lastName || '',
        sc.c1 ?? 3,
        sc.c2 ?? 3,
        sc.c3 ?? 3,
        sc.c4 ?? 3,
        sc.c5 ?? 3,
        sc.c6 ?? 3,
        sc.c7 ?? 3,
        sc.c8 ?? 3,
        sum,
        getQualitativeLabel(sum)
      ]);
    });

    const total = studentsInGrade.length;
    const passGood = stats.excellent + stats.good;
    data.push([]);
    data.push(['สรุปผลการประเมิน', '', '', '', 'ระดับคุณภาพ', 'ดีเยี่ยม (3)', 'ดี (2)', 'ผ่าน (1)', 'ไม่ผ่าน (0)', 'ระดับดีขึ้นไป']);
    data.push(['จำนวนนักเรียนทั้งหมด', `${total} คน`, '', '', 'จำนวน (คน)', stats.excellent, stats.good, stats.pass, stats.fail, passGood]);
    data.push(['', '', '', '', 'ร้อยละ (%)', 
      total > 0 ? ((stats.excellent / total) * 100).toFixed(2) + '%' : '0.00%',
      total > 0 ? ((stats.good / total) * 100).toFixed(2) + '%' : '0.00%',
      total > 0 ? ((stats.pass / total) * 100).toFixed(2) + '%' : '0.00%',
      total > 0 ? ((stats.fail / total) * 100).toFixed(2) + '%' : '0.00%',
      total > 0 ? ((passGood / total) * 100).toFixed(2) + '%' : '0.00%'
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 18 }, { wch: 18 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, shortG);
  });

  const fileName = (mode === 'all' || currentGrade === 'ทั้งหมด')
    ? `แบบประเมินคุณลักษณะ_โรงเรียนบ้านสันดาบ_รวมทุกชั้น_${year}.xlsx`
    : `แบบประเมินคุณลักษณะ_โรงเรียนบ้านสันดาบ_${formatShortGrade(currentGrade)}_${year}.xlsx`;

  XLSX.writeFile(wb, fileName);
  showToast(`ดาวน์โหลดไฟล์ Excel: ${fileName} เรียบร้อยแล้ว`, 'success');
}

// 3. ดาวน์โหลด Excel แบบประเมินสมรรถนะสำคัญผู้เรียน (5 ด้าน)
function downloadExcelCompetencies(mode = 'current') {
  if (!checkSheetJsLoaded()) return;

  const s = state.schoolInfo || {};
  const year = s.academicYear || '2569';
  const semester = s.semester || '1';
  const semText = semester === 'ตลอดปีการศึกษา' ? 'ตลอดปีการศึกษา' : `ภาคเรียนที่ ${semester}`;
  const dirName = s.directorName || 'นายกฤษฎา ผลพล';
  const currentGrade = s.gradeLevel || 'ประถมศึกษาปีที่ 1';
  const grades = getGradeListForExport(mode);

  const wb = XLSX.utils.book_new();

  grades.forEach(grade => {
    const shortG = formatShortGrade(grade);
    const studentsInGrade = state.students.filter(st => st.gradeLevel === grade);
    studentsInGrade.sort((a, b) => (Number(a.studentNumber) || 0) - (Number(b.studentNumber) || 0));
    const teacherName = getGradeTeacherName(grade);

    const data = [
      ['แบบประเมินสมรรถนะสำคัญของผู้เรียน 5 ด้าน'],
      ['โรงเรียนบ้านสันดาบ สังกัดสำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร'],
      [`ระดับชั้น${grade}`, `${semText}`, `ปีการศึกษา ${year}`],
      [`ครูประจำชั้น: ${teacherName}`, `ผู้อำนวยการ: ${dirName}`],
      [],
      ['เลขที่', 'รหัสนักเรียน', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', '1.การสื่อสาร', '2.การคิด', '3.การแก้ปัญหา', '4.ทักษะชีวิต', '5.การใช้เทคโนโลยี', 'คะแนนสรุป', 'ระดับคุณภาพ']
    ];

    const stats = { excellent: 0, good: 0, pass: 0, fail: 0 };

    studentsInGrade.forEach(st => {
      const sc = getStudentCompetenciesScores(st.id);
      const sum = sc.summary ?? 3;

      if (sum === 3) stats.excellent++;
      else if (sum === 2) stats.good++;
      else if (sum === 1) stats.pass++;
      else stats.fail++;

      data.push([
        st.studentNumber || '',
        st.studentCode || '',
        st.title || '',
        st.firstName || '',
        st.lastName || '',
        sc.k1 ?? 3,
        sc.k2 ?? 3,
        sc.k3 ?? 3,
        sc.k4 ?? 3,
        sc.k5 ?? 3,
        sum,
        getQualitativeLabel(sum)
      ]);
    });

    const total = studentsInGrade.length;
    const passGood = stats.excellent + stats.good;
    data.push([]);
    data.push(['สรุปผลการประเมิน', '', '', '', 'ระดับคุณภาพ', 'ดีเยี่ยม (3)', 'ดี (2)', 'ผ่าน (1)', 'ไม่ผ่าน (0)', 'ระดับดีขึ้นไป']);
    data.push(['จำนวนนักเรียนทั้งหมด', `${total} คน`, '', '', 'จำนวน (คน)', stats.excellent, stats.good, stats.pass, stats.fail, passGood]);
    data.push(['', '', '', '', 'ร้อยละ (%)', 
      total > 0 ? ((stats.excellent / total) * 100).toFixed(2) + '%' : '0.00%',
      total > 0 ? ((stats.good / total) * 100).toFixed(2) + '%' : '0.00%',
      total > 0 ? ((stats.pass / total) * 100).toFixed(2) + '%' : '0.00%',
      total > 0 ? ((stats.fail / total) * 100).toFixed(2) + '%' : '0.00%',
      total > 0 ? ((passGood / total) * 100).toFixed(2) + '%' : '0.00%'
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 18 }, { wch: 18 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
      { wch: 12 }, { wch: 14 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, shortG);
  });

  const fileName = (mode === 'all' || currentGrade === 'ทั้งหมด')
    ? `แบบประเมินสมรรถนะ_โรงเรียนบ้านสันดาบ_รวมทุกชั้น_${year}.xlsx`
    : `แบบประเมินสมรรถนะ_โรงเรียนบ้านสันดาบ_${formatShortGrade(currentGrade)}_${year}.xlsx`;

  XLSX.writeFile(wb, fileName);
  showToast(`ดาวน์โหลดไฟล์ Excel: ${fileName} เรียบร้อยแล้ว`, 'success');
}

// 4. ดาวน์โหลด Excel สรุปรายงานผลการประเมินรายบุคคลครบ 3 ด้าน
function downloadExcelSummaryReport(mode = 'current') {
  if (!checkSheetJsLoaded()) return;

  const s = state.schoolInfo || {};
  const year = s.academicYear || '2569';
  const semester = s.semester || '1';
  const semText = semester === 'ตลอดปีการศึกษา' ? 'ตลอดปีการศึกษา' : `ภาคเรียนที่ ${semester}`;
  const dirName = s.directorName || 'นายกฤษฎา ผลพล';
  const currentGrade = s.gradeLevel || 'ประถมศึกษาปีที่ 1';
  const grades = getGradeListForExport(mode);

  const wb = XLSX.utils.book_new();

  grades.forEach(grade => {
    const shortG = formatShortGrade(grade);
    const studentsInGrade = state.students.filter(st => st.gradeLevel === grade);
    studentsInGrade.sort((a, b) => (Number(a.studentNumber) || 0) - (Number(b.studentNumber) || 0));
    const teacherName = getGradeTeacherName(grade);

    const data = [
      ['สรุปรายงานผลการประเมินผู้เรียนครบทุกด้าน (ฉบับสมบูรณ์)'],
      ['โรงเรียนบ้านสันดาบ สังกัดสำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร'],
      [`ระดับชั้น${grade}`, `${semText}`, `ปีการศึกษา ${year}`],
      [`ครูประจำชั้น: ${teacherName}`, `ผู้อำนวยการ: ${dirName}`],
      [],
      ['เลขที่', 'รหัสนักเรียน', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'ระดับชั้น', 'การอ่าน (คะแนน)', 'การอ่าน (ผล)', 'คุณลักษณะ (คะแนน)', 'คุณลักษณะ (ผล)', 'สมรรถนะ (คะแนน)', 'สมรรถนะ (ผล)', 'สรุปภาพรวม', 'ผลการประเมิน']
    ];

    const stats = { excellent: 0, good: 0, pass: 0, fail: 0 };

    studentsInGrade.forEach(st => {
      const r = state.readingAssessments[st.id]?.summary ?? 3;
      const c = state.characteristicsAssessments[st.id]?.summary ?? 3;
      const k = state.competenciesAssessments[st.id]?.summary ?? 3;

      let overall = 3;
      if (r === 0 || c === 0 || k === 0) overall = 0;
      else if (r === 1 || c === 1 || k === 1) overall = 1;
      else if (r === 2 || c === 2 || k === 2) overall = 2;
      else overall = 3;

      if (overall === 3) stats.excellent++;
      else if (overall === 2) stats.good++;
      else if (overall === 1) stats.pass++;
      else stats.fail++;

      data.push([
        st.studentNumber || '',
        st.studentCode || '',
        st.title || '',
        st.firstName || '',
        st.lastName || '',
        grade,
        r,
        getQualitativeLabel(r),
        c,
        getQualitativeLabel(c),
        k,
        getQualitativeLabel(k),
        overall,
        getQualitativeLabel(overall)
      ]);
    });

    const total = studentsInGrade.length;
    const passGood = stats.excellent + stats.good;
    data.push([]);
    data.push(['สรุปผลการประเมินภาพรวม', '', '', '', '', 'ระดับคุณภาพ', 'ดีเยี่ยม (3)', 'ดี (2)', 'ผ่าน (1)', 'ไม่ผ่าน (0)', 'ระดับดีขึ้นไป']);
    data.push(['จำนวนนักเรียนทั้งหมด', `${total} คน`, '', '', '', 'จำนวน (คน)', stats.excellent, stats.good, stats.pass, stats.fail, passGood]);
    data.push(['', '', '', '', '', 'ร้อยละ (%)', 
      total > 0 ? ((stats.excellent / total) * 100).toFixed(2) + '%' : '0.00%',
      total > 0 ? ((stats.good / total) * 100).toFixed(2) + '%' : '0.00%',
      total > 0 ? ((stats.pass / total) * 100).toFixed(2) + '%' : '0.00%',
      total > 0 ? ((stats.fail / total) * 100).toFixed(2) + '%' : '0.00%',
      total > 0 ? ((passGood / total) * 100).toFixed(2) + '%' : '0.00%'
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
      { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
      { wch: 16 }, { wch: 18 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, shortG);
  });

  const fileName = (mode === 'all' || currentGrade === 'ทั้งหมด')
    ? `เล่มสรุปรายงานผลการประเมิน_โรงเรียนบ้านสันดาบ_รวมทุกชั้น_${year}.xlsx`
    : `เล่มสรุปรายงานผลการประเมิน_โรงเรียนบ้านสันดาบ_${formatShortGrade(currentGrade)}_${year}.xlsx`;

  XLSX.writeFile(wb, fileName);
  showToast(`ดาวน์โหลดไฟล์ Excel: ${fileName} เรียบร้อยแล้ว`, 'success');
}

// 5. ดาวน์โหลด Excel สมบูรณ์รวมทั้ง 4 แบบประเมินทุกระดับชั้น
function downloadAllAssessmentsExcel() {
  if (!checkSheetJsLoaded()) return;

  const s = state.schoolInfo || {};
  const year = s.academicYear || '2569';
  const semester = s.semester || '1';
  const semText = semester === 'ตลอดปีการศึกษา' ? 'ตลอดปีการศึกษา' : `ภาคเรียนที่ ${semester}`;
  const dirName = s.directorName || 'นายกฤษฎา ผลพล';

  const wb = XLSX.utils.book_new();

  // Sheet 1: ทะเบียนรายชื่อนักเรียนและสรุปผลทั้งโรงเรียน (101 คน)
  const masterData = [
    ['สรุปรายงานผลการประเมินพัฒนาการผู้เรียนรอบด้าน ทั้งโรงเรียน'],
    ['โรงเรียนบ้านสันดาบ สังกัดสำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร'],
    [`${semText} ปีการศึกษา ${year}`, `ผู้อำนวยการโรงเรียน: ${dirName}`],
    [],
    ['ลำดับ', 'ระดับชั้น', 'เลขที่', 'รหัสนักเรียน', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'การอ่านฯ', 'คุณลักษณะฯ', 'สมรรถนะฯ', 'สรุปภาพรวม', 'ผลการประเมิน']
  ];

  let seq = 1;
  const sortedStudents = [...state.students].sort((a, b) => {
    if (a.gradeLevel !== b.gradeLevel) return a.gradeLevel.localeCompare(b.gradeLevel);
    return (Number(a.studentNumber) || 0) - (Number(b.studentNumber) || 0);
  });

  sortedStudents.forEach(st => {
    const r = state.readingAssessments[st.id]?.summary ?? 3;
    const c = state.characteristicsAssessments[st.id]?.summary ?? 3;
    const k = state.competenciesAssessments[st.id]?.summary ?? 3;

    let overall = 3;
    if (r === 0 || c === 0 || k === 0) overall = 0;
    else if (r === 1 || c === 1 || k === 1) overall = 1;
    else if (r === 2 || c === 2 || k === 2) overall = 2;
    else overall = 3;

    masterData.push([
      seq++,
      formatShortGrade(st.gradeLevel || ''),
      st.studentNumber || '',
      st.studentCode || '',
      st.title || '',
      st.firstName || '',
      st.lastName || '',
      getQualitativeLabel(r),
      getQualitativeLabel(c),
      getQualitativeLabel(k),
      getQualitativeLabel(overall),
      overall >= 1 ? 'ผ่านเกณฑ์' : 'ไม่ผ่านเกณฑ์'
    ]);
  });

  const wsMaster = XLSX.utils.aoa_to_sheet(masterData);
  wsMaster['!cols'] = [
    { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 10 },
    { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
    { wch: 14 }, { wch: 14 }
  ];
  XLSX.utils.book_append_sheet(wb, wsMaster, 'สรุปภาพรวมทั้งโรงเรียน');

  // Sheet 2: การอ่านฯ รวมทุกชั้น
  const readingData = [
    ['แบบประเมินการอ่าน คิดวิเคราะห์ และเขียนสื่อความ (นักเรียนทั้งหมด)'],
    ['โรงเรียนบ้านสันดาบ'],
    [],
    ['ลำดับ', 'ระดับชั้น', 'เลขที่', 'รหัสนักเรียน', 'ชื่อ - นามสกุล', '1.การอ่าน', '2.คิดวิเคราะห์', '3.เขียนสื่อความ', 'สรุปคะแนน (Mode)', 'ระดับคุณภาพ']
  ];
  let rSeq = 1;
  sortedStudents.forEach(st => {
    const sc = getStudentReadingScores(st.id);
    const r1 = sc.item1 ?? 3;
    const r2 = sc.item2 ?? 3;
    const r3 = sc.item3 ?? 3;
    const sum = sc.summary ?? calculateMode([r1, r2, r3]);

    readingData.push([
      rSeq++,
      formatShortGrade(st.gradeLevel || ''),
      st.studentNumber || '',
      st.studentCode || '',
      `${st.title || ''}${st.firstName} ${st.lastName}`,
      r1, r2, r3,
      sum,
      getQualitativeLabel(sum)
    ]);
  });
  const wsReading = XLSX.utils.aoa_to_sheet(readingData);
  XLSX.utils.book_append_sheet(wb, wsReading, 'การอ่านคิดวิเคราะห์');

  // Sheet 3: คุณลักษณะฯ รวมทุกชั้น
  const charData = [
    ['แบบประเมินคุณลักษณะอันพึงประสงค์ 8 ประการ (นักเรียนทั้งหมด)'],
    ['โรงเรียนบ้านสันดาบ'],
    [],
    ['ลำดับ', 'ระดับชั้น', 'เลขที่', 'รหัสนักเรียน', 'ชื่อ - นามสกุล', '1.รักชาติ', '2.ซื่อสัตย์', '3.มีวินัย', '4.ใฝ่เรียนรู้', '5.พอเพียง', '6.มุ่งมั่น', '7.รักไทย', '8.จิตสาธารณะ', 'สรุปคะแนน (Mode)', 'ระดับคุณภาพ']
  ];
  let cSeq = 1;
  sortedStudents.forEach(st => {
    const sc = getStudentCharacteristicsScores(st.id);
    const sum = sc.summary ?? 3;

    charData.push([
      cSeq++,
      formatShortGrade(st.gradeLevel || ''),
      st.studentNumber || '',
      st.studentCode || '',
      `${st.title || ''}${st.firstName} ${st.lastName}`,
      sc.c1 ?? 3, sc.c2 ?? 3, sc.c3 ?? 3, sc.c4 ?? 3, sc.c5 ?? 3, sc.c6 ?? 3, sc.c7 ?? 3, sc.c8 ?? 3,
      sum,
      getQualitativeLabel(sum)
    ]);
  });
  const wsChar = XLSX.utils.aoa_to_sheet(charData);
  XLSX.utils.book_append_sheet(wb, wsChar, 'คุณลักษณะอันพึงประสงค์');

  // Sheet 4: สมรรถนะฯ รวมทุกชั้น
  const compData = [
    ['แบบประเมินสมรรถนะสำคัญของผู้เรียน 5 ด้าน (นักเรียนทั้งหมด)'],
    ['โรงเรียนบ้านสันดาบ'],
    [],
    ['ลำดับ', 'ระดับชั้น', 'เลขที่', 'รหัสนักเรียน', 'ชื่อ - นามสกุล', '1.การสื่อสาร', '2.การคิด', '3.แก้ปัญหา', '4.ทักษะชีวิต', '5.เทคโนโลยี', 'สรุปคะแนน (Mode)', 'ระดับคุณภาพ']
  ];
  let kSeq = 1;
  sortedStudents.forEach(st => {
    const sc = getStudentCompetenciesScores(st.id);
    const sum = sc.summary ?? 3;

    compData.push([
      kSeq++,
      formatShortGrade(st.gradeLevel || ''),
      st.studentNumber || '',
      st.studentCode || '',
      `${st.title || ''}${st.firstName} ${st.lastName}`,
      sc.k1 ?? 3, sc.k2 ?? 3, sc.k3 ?? 3, sc.k4 ?? 3, sc.k5 ?? 3,
      sum,
      getQualitativeLabel(sum)
    ]);
  });
  const wsComp = XLSX.utils.aoa_to_sheet(compData);
  XLSX.utils.book_append_sheet(wb, wsComp, 'สมรรถนะสำคัญผู้เรียน');

  const fileName = `แบบประเมินผู้เรียน_โรงเรียนบ้านสันดาบ_ชุดสมบูรณ์ทุกเล่ม_${year}.xlsx`;
  XLSX.writeFile(wb, fileName);
  showToast(`ดาวน์โหลดไฟล์ Excel ชุดสมบูรณ์: ${fileName} เรียบร้อยแล้ว`, 'success');
}

/* ==========================================================================
   16. Google Sheets & Google Drive Cloud Database Controllers
   ========================================================================== */

/**
 * 1. บันทึก URL เว็บแอป Google Apps Script
 */
function adminSaveGasUrl() {
  const input = document.getElementById('admin-gas-webapp-url-input');
  if (!input) return;
  const url = input.value.trim();
  
  if (!url) {
    if (confirm('คุณต้องการล้าง URL ของ Google Apps Script Web App และใช้งานโหมดออฟไลน์ใช่หรือไม่?')) {
      window.cloudApi.setWebappUrl('');
      showToast('ล้างการตั้งค่า Web App เรียบร้อยแล้ว (ทำงานในโหมดออฟไลน์)', 'info');
    }
    return;
  }

  if (!url.startsWith('https://script.google.com')) {
    alert('รูปแบบ URL ไม่ถูกต้อง กรุณาระบุ Web App URL ที่ได้จากการ Deploy ใน Google Apps Script (ขึ้นต้นด้วย https://script.google.com)');
    return;
  }

  window.cloudApi.setWebappUrl(url);
  showToast('บันทึก Google Apps Script Web App URL สำเร็จ', 'success');
  adminTestGasConnection(false);
}

/**
 * 2. ทดสอบการเชื่อมต่อ Google Apps Script
 */
async function adminTestGasConnection(showAlert = true) {
  if (!window.cloudApi.isConfigured()) {
    alert('กรุณากรอก URL ของ Google Apps Script Web App ก่อนทดสอบเชื่อมต่อ\nหากยังไม่มีโค้ด ให้กดปุ่ม "วิธีติดตั้ง Apps Script และรับ URL" ด้านล่าง');
    return;
  }

  try {
    showToast('กำลังทดสอบการเชื่อมต่อ Google Sheets & Drive...', 'info');
    const res = await window.cloudApi.testConnection();
    if (res && res.success) {
      showToast(`เชื่อมต่อสำเร็จ: ${res.spreadsheetName || 'Google Sheets'} (${res.driveFolderName || 'Google Drive'})`, 'success');
      if (showAlert) {
        alert(`✅ การเชื่อมต่อสำเร็จสมบูรณ์!\n\n• Google Sheets: ${res.spreadsheetName || 'แบบประเมินผู้เรียน'}\n• Sheet ID: ${res.spreadsheetId}\n• Google Drive Folder: ${res.driveFolderName || 'คลังไฟล์'}\n• Folder ID: ${res.driveFolderId}\n• เวลาเซิร์ฟเวอร์: ${res.serverTime}`);
      }
    } else {
      throw new Error(res.error || 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้');
    }
  } catch (err) {
    showToast('เชื่อมต่อไม่สำเร็จ: ' + err.message, 'error');
    if (showAlert) {
      alert(`❌ การเชื่อมต่อไม่สำเร็จ:\n${err.message}\n\nคำแนะนำ:\n1. ตรวจสอบว่าใน Apps Script ได้เลือก "ผู้มีสิทธิ์เข้าถึง: ทุกคน (Anyone)" หรือยัง\n2. ตรวจสอบว่าได้กด Run ฟังก์ชัน setupDatabase แล้วหรือยัง`);
    }
  }
}

/**
 * 3. สั่งสร้างโครงสร้างฐานข้อมูล 8 ตารางใน Google Sheets อัตโนมัติ
 */
async function adminAutoSetupGoogleSheets() {
  if (!window.cloudApi.isConfigured()) {
    alert('กรุณาระบุและบันทึก URL ของ Google Apps Script Web App ก่อนสั่งสร้างฐานข้อมูล\n(ดูวิธีได้ที่ปุ่ม "วิธีติดตั้ง Apps Script และรับ URL")');
    return;
  }

  const confirmMsg = `⚡ ยืนยันการสั่งสร้างฐานข้อมูลใน Google Sheets อัตโนมัติ?\n\nระบบจะสร้างและจัดรูปแบบตารางทั้งหมด 8 ชีต ได้แก่:\n1. School_Info (ข้อมูลโรงเรียนและผู้บริหาร)\n2. Teachers (ข้อมูลครูประจำชั้น 12 ท่าน)\n3. Students (ข้อมูลนักเรียน 101 คน ป.1 - ป.6)\n4. Reading_Assessments (แบบประเมินการอ่าน คิดวิเคราะห์ฯ)\n5. Characteristics_Assessments (แบบประเมินคุณลักษณะฯ)\n6. Competencies_Assessments (แบบประเมินสมรรถนะฯ)\n7. Files_Evidence (คลังไฟล์ Google Drive)\n8. System_Logs (บันทึกประวัติการทำงาน)\n\nต้องการดำเนินการต่อหรือไม่?`;

  if (!confirm(confirmMsg)) return;

  try {
    showToast('กำลังสั่งสร้างฐานข้อมูลใน Google Sheets อัตโนมัติ...', 'info');
    const res = await window.cloudApi.initDatabase();
    if (res && res.success) {
      showToast('สร้างฐานข้อมูล 8 ตารางใน Google Sheets อัตโนมัติสำเร็จสมบูรณ์!', 'success');
      alert(`🎉 สร้างฐานข้อมูลสำเร็จสมบูรณ์!\n\nสร้างตารางครบถ้วน 8 ชีตใน Google Sheets ID: 1tx9-QGCSdUzOtXdkT6mxdYkloCbtrC0-WGbjgBLHg5Q\nและเชื่อมต่อกับ Google Drive Folder ID: 1Bsru56qKchSlP0imhGnkwIAWu2S4ymvT เรียบร้อยแล้ว`);
    } else {
      throw new Error(res.error || 'เกิดข้อผิดพลาดในการสร้างฐานข้อมูล');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    alert('ไม่สามารถสร้างฐานข้อมูลได้: ' + err.message);
  }
}

/**
 * 4. ดึงข้อมูลทั้งหมดจาก Google Sheets (Pull All Data)
 */
async function adminPullDataFromGoogleSheets() {
  if (!window.cloudApi.isConfigured()) {
    alert('กรุณาตั้งค่า Google Apps Script Web App URL ก่อนดึงข้อมูล');
    return;
  }

  if (!confirm('ยืนยันการดึงข้อมูลล่าสุดจาก Google Sheets มาอัปเดตระบบในเครื่องนี้?\nข้อมูลนักเรียน ครู และคะแนนจะถูกปรับปรุงให้ตรงกับ Google Sheets')) {
    return;
  }

  try {
    showToast('กำลังดึงข้อมูลทั้งหมดจาก Google Sheets...', 'info');
    const remoteData = await window.cloudApi.pullAllData();
    
    if (remoteData) {
      if (remoteData.schoolInfo && Object.keys(remoteData.schoolInfo).length > 0) {
        state.schoolInfo = { ...state.schoolInfo, ...remoteData.schoolInfo };
      }
      if (remoteData.teachers && remoteData.teachers.length > 0) {
        state.teachers = remoteData.teachers;
      }
      if (remoteData.students && remoteData.students.length > 0) {
        state.students = remoteData.students;
      }
      if (remoteData.readingAssessments && Object.keys(remoteData.readingAssessments).length > 0) {
        state.readingAssessments = remoteData.readingAssessments;
      }
      if (remoteData.characteristicsAssessments && Object.keys(remoteData.characteristicsAssessments).length > 0) {
        state.characteristicsAssessments = remoteData.characteristicsAssessments;
      }
      if (remoteData.competenciesAssessments && Object.keys(remoteData.competenciesAssessments).length > 0) {
        state.competenciesAssessments = remoteData.competenciesAssessments;
      }

      saveData(false);
      renderAll();
      showToast('ดึงข้อมูลและอัปเดตระบบสำเร็จครบถ้วน', 'success');
      alert(`✅ ดึงข้อมูลสำเร็จ!\n• นักเรียน: ${state.students.length} คน\n• ครูและบุคลากร: ${state.teachers.length} ท่าน\n• คะแนนประเมิน 3 ด้านครบถ้วน`);
    }
  } catch (err) {
    showToast('ดึงข้อมูลไม่สำเร็จ: ' + err.message, 'error');
    alert('เกิดข้อผิดพลาดในการดึงข้อมูล: ' + err.message);
  }
}

/**
 * 5. ส่งข้อมูลทั้งหมดขึ้น Google Sheets (Push All Data)
 */
async function adminPushDataToGoogleSheets() {
  if (!window.cloudApi.isConfigured()) {
    alert('กรุณาตั้งค่า Google Apps Script Web App URL ก่อนส่งข้อมูล');
    return;
  }

  if (!confirm(`ยืนยันการส่งข้อมูลทั้งหมดในระบบขึ้น Google Sheets?\n• นักเรียน ${state.students.length} คน\n• ครู ${state.teachers.length} ท่าน\n• ผลการประเมินทั้ง 3 ด้าน`)) {
    return;
  }

  try {
    showToast('กำลังส่งข้อมูลขึ้น Google Sheets...', 'info');
    const res = await window.cloudApi.pushAllData(state);
    if (res && res.success) {
      showToast('ส่งข้อมูลและผลการประเมินขึ้น Google Sheets เรียบร้อยแล้ว', 'success');
      alert('✅ ส่งข้อมูลขึ้น Google Sheets สำเร็จเรียบร้อยสมบูรณ์!');
    } else {
      throw new Error(res.error || 'เกิดข้อผิดพลาดในการบันทึก');
    }
  } catch (err) {
    showToast('ส่งข้อมูลไม่สำเร็จ: ' + err.message, 'error');
    alert('เกิดข้อผิดพลาดในการส่งข้อมูล: ' + err.message);
  }
}

/**
 * 6. ซิงค์ข้อมูลด่วนจากแถบหัวเรื่อง (Quick Sync)
 */
async function adminQuickSyncCloud() {
  if (!window.cloudApi.isConfigured()) {
    switchTab('tab-admin');
    showToast('กรุณาระบุ Web App URL เพื่อเชื่อมต่อ Google Sheets', 'warning');
    return;
  }

  try {
    showToast('กำลังซิงค์ข้อมูลกับ Google Sheets...', 'info');
    await window.cloudApi.pushAllData(state);
    showToast('ซิงค์ข้อมูลกับ Google Sheets เรียบร้อยแล้ว ☁️', 'success');
  } catch (err) {
    showToast('ซิงค์ไม่สำเร็จ: ' + err.message, 'error');
  }
}

/**
 * 7. สลับเปิด/ปิด Real-Time Auto-Sync
 */
function toggleGasAutoSync(checked) {
  window.cloudApi.setAutoSync(checked);
  showToast(checked ? 'เปิดระบบซิงค์อัตโนมัติ (Auto-Sync) แล้ว' : 'ปิดระบบซิงค์อัตโนมัติแล้ว (บันทึกเฉพาะในเครื่อง)', 'info');
}

/**
 * 8. เปิด/ปิด โมดอลคู่มือและโค้ด Google Apps Script
 */
async function openGasGuideModal() {
  const modal = document.getElementById('gas-guide-modal');
  const textarea = document.getElementById('gas-code-raw-textarea');
  if (textarea) {
    if (!window.GAS_CODE_CONTENT) {
      try {
        const resp = await fetch('Code.gs');
        if (resp.ok) {
          window.GAS_CODE_CONTENT = await resp.text();
        }
      } catch (e) {
        console.warn('Could not fetch Code.gs:', e);
      }
    }
    if (window.GAS_CODE_CONTENT) {
      textarea.value = window.GAS_CODE_CONTENT;
    }
  }
  if (modal) modal.classList.add('open');
}

function closeGasGuideModal() {
  const modal = document.getElementById('gas-guide-modal');
  if (modal) modal.classList.remove('open');
}

function copyGasCodeToClipboard() {
  const code = window.GAS_CODE_CONTENT || (document.getElementById('gas-code-raw-textarea')?.value || '');
  if (!code) {
    alert('ไม่พบโค้ด Google Apps Script');
    return;
  }

  navigator.clipboard.writeText(code).then(() => {
    showToast('คัดลอกโค้ด Google Apps Script (Code.gs) เรียบร้อยแล้ว 📋', 'success');
  }).catch(() => {
    const textarea = document.getElementById('gas-code-raw-textarea');
    if (textarea) {
      textarea.select();
      document.execCommand('copy');
      showToast('คัดลอกโค้ดเรียบร้อยแล้ว', 'success');
    }
  });
}

/**
 * 9. คลังไฟล์ภาพและเอกสาร Google Drive
 */
function openDriveFilesModal() {
  const modal = document.getElementById('drive-files-modal');
  if (modal) modal.classList.add('open');
  refreshDriveFilesList();
}

function closeDriveFilesModal() {
  const modal = document.getElementById('drive-files-modal');
  if (modal) modal.classList.remove('open');
}

async function refreshDriveFilesList() {
  const container = document.getElementById('drive-files-list-container');
  const countEl = document.getElementById('drive-files-count');
  if (!container) return;

  if (!window.cloudApi.isConfigured()) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2.5rem 1rem; color: #64748b; grid-column: 1 / -1;">
        <i class="fa-solid fa-cloud-slash" style="font-size: 2.5rem; color: #cbd5e1; margin-bottom: 0.75rem; display: block;"></i>
        <div style="font-weight: 700; font-size: 1rem; color: #334155;">ยังไม่ได้เชื่อมต่อ Google Apps Script Web App</div>
        <div style="font-size: 0.85rem; margin-top: 4px;">กรุณาบันทึก Web App URL ในแผงควบคุมแอดมิน เพื่อเปิดดูคลังไฟล์จาก Google Drive</div>
        <button type="button" class="btn btn-primary btn-sm" onclick="closeDriveFilesModal(); switchTab('tab-admin');" style="margin-top: 1rem;">
          <i class="fa-solid fa-sliders"></i> ไปที่การตั้งค่า Web App
        </button>
      </div>
    `;
    if (countEl) countEl.textContent = '0';
    return;
  }

  container.innerHTML = `
    <div style="text-align: center; padding: 2rem; color: #2563eb; grid-column: 1 / -1;">
      <i class="fa-solid fa-arrows-rotate fa-spin" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
      กำลังโหลดรายการไฟล์จาก Google Drive...
    </div>
  `;

  try {
    const files = await window.cloudApi.getFilesList();
    if (countEl) countEl.textContent = String(files.length);

    if (files.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2.5rem 1rem; color: #64748b; grid-column: 1 / -1;">
          <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; color: #94a3b8; margin-bottom: 0.75rem; display: block;"></i>
          <div style="font-weight: 700; color: #334155;">ยังไม่มีไฟล์ที่บันทึกในฐานข้อมูลชีต Files_Evidence</div>
          <div style="font-size: 0.85rem; margin-top: 4px;">คุณสามารถกดปุ่ม "อัปโหลดไฟล์ขึ้น Drive" ด้านบน หรืออัปโหลดรูปครู/นักเรียน</div>
        </div>
      `;
      return;
    }

    let html = '';
    files.forEach(file => {
      const isImg = file.mimeType && file.mimeType.startsWith('image/');
      const displayUrl = file.directUrl || file.viewUrl;
      const thumbHtml = isImg
        ? `<img src="${displayUrl}" alt="${file.fileName}" onerror="this.src='images/school_logo.png'">`
        : `<i class="fa-solid fa-file-lines" style="font-size: 2.5rem; color: #64748b;"></i>`;

      html += `
        <div class="drive-file-card">
          <div class="drive-file-thumb">${thumbHtml}</div>
          <div class="drive-file-body">
            <div>
              <div class="drive-file-name" title="${file.fileName}">${file.fileName}</div>
              <div class="drive-file-meta">
                หมวด: <strong>${file.category || 'ทั่วไป'}</strong> ${file.targetName ? `• ${file.targetName}` : ''}
              </div>
            </div>
            <div class="drive-file-actions">
              <a href="${file.viewUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" style="font-size: 0.75rem; padding: 0.25rem 0.5rem; flex: 1; text-align: center;">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> เปิดดู
              </a>
              <button type="button" class="btn btn-outline btn-sm" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;" onclick="copyDirectDriveLink('${displayUrl}')" title="คัดลอกลิงก์รูปตรง">
                <i class="fa-solid fa-copy"></i> ลิงก์ตรง
              </button>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: #ef4444; grid-column: 1 / -1;">
        เกิดข้อผิดพลาดในการโหลดรายการไฟล์: ${err.message}
      </div>
    `;
  }
}

function copyDirectDriveLink(url) {
  navigator.clipboard.writeText(url).then(() => {
    showToast('คัดลอกลิงก์ไฟล์ Google Drive เรียบร้อยแล้ว', 'success');
  });
}

/**
 * 10. อัปโหลดไฟล์ทั่วไปขึ้น Google Drive
 */
async function handleCustomDriveFileUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!window.cloudApi.isConfigured()) {
    alert('กรุณาตั้งค่า Google Apps Script Web App URL ก่อนอัปโหลดไฟล์ขึ้น Google Drive');
    return;
  }

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      showToast(`กำลังอัปโหลด ${file.name} ไปยัง Google Drive Folder ID: 1Bsru56qKchSlP0imhGnkwIAWu2S4ymvT...`, 'info');
      const res = await window.cloudApi.uploadFile(e.target.result, file.name, file.type, 'evidence', '', 'ไฟล์หลักฐานทั่วไป');
      if (res && res.success) {
        showToast('อัปโหลดไฟล์ขึ้น Google Drive สำเร็จ', 'success');
        refreshDriveFilesList();
      } else {
        throw new Error(res.error || 'เกิดข้อผิดพลาด');
      }
    } catch (err) {
      showToast('อัปโหลดไฟล์ไม่สำเร็จ: ' + err.message, 'error');
      alert('ไม่สามารถอัปโหลดไฟล์ขึ้น Drive ได้: ' + err.message);
    }
  };
  reader.readAsDataURL(file);
}

// Global Window Function Exports for Inline HTML Handlers
window.state = state;
window.switchTab = typeof switchTab !== 'undefined' ? switchTab : null;
window.toggleMobileSidebar = typeof toggleMobileSidebar !== 'undefined' ? toggleMobileSidebar : null;
window.adminQuickSyncCloud = typeof adminQuickSyncCloud !== 'undefined' ? adminQuickSyncCloud : null;
window.selectGradeFromDropdown = typeof selectGradeFromDropdown !== 'undefined' ? selectGradeFromDropdown : null;
window.quickSelectGrade = typeof quickSelectGrade !== 'undefined' ? quickSelectGrade : null;
window.toggleGradeDropdown = typeof toggleGradeDropdown !== 'undefined' ? toggleGradeDropdown : null;
window.closeGradeDropdown = typeof closeGradeDropdown !== 'undefined' ? closeGradeDropdown : null;
window.openGradeModal = typeof openGradeModal !== 'undefined' ? openGradeModal : null;
window.closeGradeModal = typeof closeGradeModal !== 'undefined' ? closeGradeModal : null;
window.saveGradeModal = typeof saveGradeModal !== 'undefined' ? saveGradeModal : null;
window.selectGradePill = typeof selectGradePill !== 'undefined' ? selectGradePill : null;
window.openStudentModal = typeof openStudentModal !== 'undefined' ? openStudentModal : null;
window.closeStudentModal = typeof closeStudentModal !== 'undefined' ? closeStudentModal : null;
window.saveStudentModal = typeof saveStudentModal !== 'undefined' ? saveStudentModal : null;
window.deleteStudent = typeof deleteStudent !== 'undefined' ? deleteStudent : null;
window.openTeacherModal = typeof openTeacherModal !== 'undefined' ? openTeacherModal : null;
window.closeTeacherModal = typeof closeTeacherModal !== 'undefined' ? closeTeacherModal : null;
window.saveTeacherModal = typeof saveTeacherModal !== 'undefined' ? saveTeacherModal : null;
window.deleteTeacher = typeof deleteTeacher !== 'undefined' ? deleteTeacher : null;
window.openGasGuideModal = typeof openGasGuideModal !== 'undefined' ? openGasGuideModal : null;
window.closeGasGuideModal = typeof closeGasGuideModal !== 'undefined' ? closeGasGuideModal : null;
window.copyGasCodeToClipboard = typeof copyGasCodeToClipboard !== 'undefined' ? copyGasCodeToClipboard : null;
window.openDriveFilesModal = typeof openDriveFilesModal !== 'undefined' ? openDriveFilesModal : null;
window.closeDriveFilesModal = typeof closeDriveFilesModal !== 'undefined' ? closeDriveFilesModal : null;
window.refreshDriveFilesList = typeof refreshDriveFilesList !== 'undefined' ? refreshDriveFilesList : null;
window.handleCustomDriveFileUpload = typeof handleCustomDriveFileUpload !== 'undefined' ? handleCustomDriveFileUpload : null;
window.adminTestGasConnection = typeof adminTestGasConnection !== 'undefined' ? adminTestGasConnection : null;
window.adminAutoSetupGoogleSheets = typeof adminAutoSetupGoogleSheets !== 'undefined' ? adminAutoSetupGoogleSheets : null;
window.adminPullDataFromGoogleSheets = typeof adminPullDataFromGoogleSheets !== 'undefined' ? adminPullDataFromGoogleSheets : null;
window.adminPushDataToGoogleSheets = typeof adminPushDataToGoogleSheets !== 'undefined' ? adminPushDataToGoogleSheets : null;
window.adminSaveGasUrl = typeof adminSaveGasUrl !== 'undefined' ? adminSaveGasUrl : null;
window.showToast = typeof showToast !== 'undefined' ? showToast : null;
window.saveData = typeof saveData !== 'undefined' ? saveData : null;
window.saveState = function() { if (typeof saveData === 'function') saveData(false); };
window.renderAll = typeof renderAll !== 'undefined' ? renderAll : null;


