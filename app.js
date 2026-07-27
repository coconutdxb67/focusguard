/* ===== FocusGuard - 专注日程管理 ===== */

// ===== 数据管理 =====
const Store = {
    KEY: 'focusguard_data',
    data: null,

    init() {
        const saved = localStorage.getItem(this.KEY);
        if (saved) {
            this.data = JSON.parse(saved);
        } else {
            this.data = {
                tasks: [],
                restrictedApps: this.getDefaultRestrictions(),
                settings: {
                    fullscreenAlarm: true,
                    soundAlarm: true,
                    notifyAlarm: true,
                    vibrateAlarm: true,
                    forceLockScreen: true,
                    snoozeLimit: 2,
                    alarmVolume: 80,
                    theme: 'light'
                },
                stats: {
                    totalCompleted: 0,
                    totalFocusTime: 0,
                    streak: 0,
                    lastActiveDate: null,
                    weeklyFocus: [0, 0, 0, 0, 0, 0, 0],
                    history: []
                }
            };
            this.save();
        }
        // 确保新字段存在
        if (!this.data.restrictedApps) this.data.restrictedApps = this.getDefaultRestrictions();
        if (!this.data.stats) this.data.stats = { totalCompleted: 0, totalFocusTime: 0, streak: 0, lastActiveDate: null, weeklyFocus: [0,0,0,0,0,0,0], history: [] };
        if (!this.data.stats.weeklyFocus) this.data.stats.weeklyFocus = [0,0,0,0,0,0,0];
        if (!this.data.stats.history) this.data.stats.history = [];
    },

    save() {
        localStorage.setItem(this.KEY, JSON.stringify(this.data));
    },

    getDefaultRestrictions() {
        return [
            { name: '抖音', category: 'video' },
            { name: '快手', category: 'video' },
            { name: 'B站短视频', category: 'video' },
            { name: '微信视频号', category: 'video' },
            { name: '小红书', category: 'video' },
            { name: '王者荣耀', category: 'game' },
            { name: '原神', category: 'game' },
            { name: '和平精英', category: 'game' },
            { name: '英雄联盟', category: 'game' },
            { name: 'Steam游戏', category: 'game' },
            { name: '微信', category: 'social' },
            { name: 'QQ', category: 'social' },
            { name: '微博', category: 'social' },
        ];
    },

    addTask(task) {
        task.id = Date.now().toString();
        task.completed = false;
        task.createdAt = Date.now();
        this.data.tasks.push(task);
        this.save();
        return task;
    },

    updateTask(id, updates) {
        const task = this.data.tasks.find(t => t.id === id);
        if (task) {
            Object.assign(task, updates);
            this.save();
        }
        return task;
    },

    deleteTask(id) {
        this.data.tasks = this.data.tasks.filter(t => t.id !== id);
        this.save();
    },

    getTodayTasks() {
        return this.data.tasks
            .filter(t => !t.date || t.date === this.getTodayStr())
            .sort((a, b) => a.startTime.localeCompare(b.startTime));
    },

    getTodayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    },

    addRestriction(app) {
        this.data.restrictedApps.push(app);
        this.save();
    },

    removeRestriction(index) {
        this.data.restrictedApps.splice(index, 1);
        this.save();
    },

    addFocusTime(minutes) {
        this.data.stats.totalFocusTime += minutes;
        const day = new Date().getDay();
        const todayIdx = day === 0 ? 6 : day - 1;
        this.data.stats.weeklyFocus[todayIdx] += minutes;
        this.save();
    },

    completeTask(task) {
        task.completed = true;
        task.completedAt = Date.now();
        this.data.stats.totalCompleted++;
        this.data.stats.history.unshift({
            type: 'task',
            title: task.title,
            time: new Date().toLocaleString('zh-CN'),
            badge: 'completed'
        });
        if (this.data.stats.history.length > 50) this.data.stats.history.pop();
        this.updateStreak();
        this.save();
    },

    addFocusHistory(taskName, minutes) {
        this.data.stats.history.unshift({
            type: 'focus',
            title: taskName,
            time: new Date().toLocaleString('zh-CN'),
            badge: 'focus',
            duration: minutes
        });
        if (this.data.stats.history.length > 50) this.data.stats.history.pop();
        this.save();
    },

    updateStreak() {
        const today = this.getTodayStr();
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        if (this.data.stats.lastActiveDate === today) return;
        if (this.data.stats.lastActiveDate === yesterday) {
            this.data.stats.streak++;
        } else {
            this.data.stats.streak = 1;
        }
        this.data.stats.lastActiveDate = today;
    }
};

// ===== 音频管理 =====
const AudioMgr = {
    ctx: null,
    oscillator: null,
    gainNode: null,
    playing: false,

    init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch(e) { console.warn('Audio not supported'); }
    },

    playAlarm(volume) {
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        this.stop();
        this.playing = true;
        const vol = (volume ?? Store.data.settings.alarmVolume) / 100;

        const playTone = () => {
            if (!this.playing) return;
            this.oscillator = this.ctx.createOscillator();
            this.gainNode = this.ctx.createGain();
            this.oscillator.connect(this.gainNode);
            this.gainNode.connect(this.ctx.destination);

            this.oscillator.frequency.setValueAtTime(880, this.ctx.currentTime);
            this.oscillator.frequency.setValueAtTime(660, this.ctx.currentTime + 0.15);
            this.oscillator.type = 'sine';

            this.gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
            this.gainNode.gain.linearRampToValueAtTime(vol * 0.5, this.ctx.currentTime + 0.05);
            this.gainNode.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);

            this.oscillator.start(this.ctx.currentTime);
            this.oscillator.stop(this.ctx.currentTime + 0.3);

            this.oscillator.onended = () => {
                if (this.playing) {
                    setTimeout(playTone, 200);
                }
            };
        };
        playTone();
    },

    playTick() {
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.frequency.value = 1000;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    },

    playSuccess() {
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        [523, 659, 784].forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0, this.ctx.currentTime + i * 0.12);
            gain.gain.linearRampToValueAtTime(0.15, this.ctx.currentTime + i * 0.12 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + i * 0.12 + 0.3);
            osc.start(this.ctx.currentTime + i * 0.12);
            osc.stop(this.ctx.currentTime + i * 0.12 + 0.3);
        });
    },

    stop() {
        this.playing = false;
        if (this.oscillator) {
            try { this.oscillator.stop(); } catch(e) {}
            this.oscillator = null;
        }
    }
};

// ===== Toast 通知 =====
function toast(msg, type = '') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.3s';
        setTimeout(() => el.remove(), 300);
    }, 2500);
}

// ===== 导航 =====
const Nav = {
    currentTab: 'schedule',
    titles: {
        schedule: '今日日程',
        alarm: '闹钟提醒',
        focus: '专注模式',
        restrict: '应用限制',
        recommend: '推荐日程',
        stats: '数据统计'
    },

    init() {
        document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchTab(btn.dataset.tab);
                // 关闭移动端侧边栏
                document.getElementById('sidebar').classList.remove('mobile-open');
            });
        });

        document.getElementById('menuToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('mobile-open');
        });
    },

    switchTab(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${tab}`).classList.add('active');
        document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === tab);
        });
        document.getElementById('pageTitle').textContent = this.titles[tab];

        if (tab === 'stats') StatsView.render();
        if (tab === 'alarm') AlarmView.render();
        if (tab === 'restrict') RestrictView.render();
        if (tab === 'recommend') RecommendView.render();
        if (tab === 'focus') FocusView.refreshTaskSelect();
    }
};

// ===== 日程视图 =====
const ScheduleView = {
    editingId: null,

    init() {
        document.getElementById('addTaskBtn').addEventListener('click', () => this.openModal());
        document.getElementById('taskModalClose').addEventListener('click', () => this.closeModal());
        document.getElementById('taskCancelBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('taskSaveBtn').addEventListener('click', () => this.saveTask());
        document.getElementById('taskDeleteBtn').addEventListener('click', () => this.deleteTask());

        document.getElementById('taskModal').addEventListener('click', (e) => {
            if (e.target.id === 'taskModal') this.closeModal();
        });
    },

    render() {
        const tasks = Store.getTodayTasks();
        const timeline = document.getElementById('timeline');
        const empty = document.getElementById('scheduleEmpty');

        if (tasks.length === 0) {
            empty.style.display = 'block';
            // 清除除empty外的所有元素
            timeline.querySelectorAll('.task-item').forEach(el => el.remove());
        } else {
            empty.style.display = 'none';
            timeline.querySelectorAll('.task-item').forEach(el => el.remove());

            const now = new Date();
            const nowStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

            tasks.forEach(task => {
                const isCurrent = nowStr >= task.startTime && nowStr < task.endTime;
                const el = this.createTaskElement(task, isCurrent);
                timeline.appendChild(el);
            });
        }

        this.updateProgress(tasks);
        this.updateNextTask(tasks);
    },

    createTaskElement(task, isCurrent) {
        const colors = {
            work: '#4F46E5', study: '#3B82F6', exercise: '#10B981',
            life: '#F59E0B', other: '#8B5CF6'
        };
        const catIcons = {
            work: '💼', study: '📚', exercise: '🏃', life: '🏠', other: '📌'
        };

        const el = document.createElement('div');
        el.className = `task-item ${task.completed ? 'completed' : ''} ${isCurrent && !task.completed ? 'current' : ''}`;
        el.innerHTML = `
            <div class="task-color-bar" style="background:${colors[task.category] || '#8B5CF6'}"></div>
            <div class="task-time">
                <span class="task-time-start">${task.startTime}</span>
                <span class="task-time-end">${task.endTime}</span>
            </div>
            <div class="task-body" data-id="${task.id}">
                <div class="task-checkbox"></div>
                <div class="task-info">
                    <div class="task-title">${this.escape(task.title)}</div>
                    <div class="task-meta">
                        <span>${catIcons[task.category]} ${this.catName(task.category)}</span>
                        <span class="task-priority ${task.priority}"></span>
                        ${task.alarm ? '<span>🔔</span>' : ''}
                        ${task.autoFocus ? '<span>🔒</span>' : ''}
                    </div>
                </div>
            </div>
            <div class="task-actions">
                <button class="task-action-btn" data-edit="${task.id}" title="编辑">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
            </div>
        `;

        // 点击任务体切换完成状态
        el.querySelector('.task-body').addEventListener('click', (e) => {
            if (e.target.closest('.task-checkbox') || e.target.closest('.task-title')) {
                this.toggleComplete(task.id);
            } else {
                this.openModal(task.id);
            }
        });
        el.querySelector('.task-checkbox').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleComplete(task.id);
        });
        el.querySelector('[data-edit]').addEventListener('click', (e) => {
            e.stopPropagation();
            this.openModal(task.id);
        });

        return el;
    },

    catName(cat) {
        return { work: '工作', study: '学习', exercise: '运动', life: '生活', other: '其他' }[cat] || '其他';
    },

    escape(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    toggleComplete(id) {
        const task = Store.data.tasks.find(t => t.id === id);
        if (!task) return;
        if (!task.completed) {
            Store.completeTask(task);
            AudioMgr.playSuccess();
            toast('任务已完成！', 'success');
        } else {
            task.completed = false;
            task.completedAt = null;
            Store.save();
        }
        this.render();
        FocusView.refreshTaskSelect();
    },

    updateProgress(tasks) {
        const total = tasks.length;
        const completed = tasks.filter(t => t.completed).length;
        const percent = total > 0 ? Math.round(completed / total * 100) : 0;
        const circumference = 2 * Math.PI * 52;
        const offset = circumference - (percent / 100) * circumference;

        document.getElementById('progressRing').style.strokeDashoffset = offset;
        document.getElementById('progressPercent').textContent = percent + '%';
        document.getElementById('progressLabel').textContent = `${completed} / ${total}`;
        document.getElementById('completedCount').textContent = completed;
        document.getElementById('pendingCount').textContent = total - completed;

        // 专注时长
        const focusMin = Store.data.stats.totalFocusTime;
        document.getElementById('focusTimeToday').textContent = focusMin >= 60 ?
            `${Math.floor(focusMin/60)}h${focusMin%60 > 0 ? focusMin%60+'m' : ''}` : `${focusMin}m`;

        // 连续天数
        document.getElementById('streakDays').textContent = Store.data.stats.streak;
    },

    updateNextTask(tasks) {
        const card = document.getElementById('nextTaskCard');
        const now = new Date();
        const nowStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

        const nextTask = tasks.find(t => !t.completed && t.startTime > nowStr);
        if (nextTask) {
            card.style.display = 'block';
            document.getElementById('nextTaskName').textContent = nextTask.title;
            document.getElementById('nextTaskTime').textContent = `${nextTask.startTime} - ${nextTask.endTime}`;

            // 倒计时
            const [h, m] = nextTask.startTime.split(':').map(Number);
            const target = new Date();
            target.setHours(h, m, 0, 0);
            const diff = target - now;
            if (diff > 0) {
                const hours = Math.floor(diff / 3600000);
                const mins = Math.floor((diff % 3600000) / 60000);
                document.getElementById('nextTaskCountdown').textContent =
                    hours > 0 ? `${hours}小时${mins}分钟后` : `${mins}分钟后开始`;
            } else {
                document.getElementById('nextTaskCountdown').textContent = '即将开始';
            }
        } else {
            card.style.display = 'none';
        }
    },

    openModal(id) {
        this.editingId = id || null;
        const modal = document.getElementById('taskModal');
        const title = document.getElementById('taskModalTitle');
        const deleteBtn = document.getElementById('taskDeleteBtn');

        if (id) {
            const task = Store.data.tasks.find(t => t.id === id);
            if (!task) return;
            title.textContent = '编辑日程';
            deleteBtn.style.display = 'inline-flex';
            document.getElementById('taskTitle').value = task.title;
            document.getElementById('taskStart').value = task.startTime;
            document.getElementById('taskEnd').value = task.endTime;
            document.getElementById('taskCategory').value = task.category;
            document.getElementById('taskPriority').value = task.priority;
            document.getElementById('taskAlarm').checked = task.alarm;
            document.getElementById('taskAutoFocus').checked = task.autoFocus;
            document.getElementById('taskNote').value = task.note || '';
        } else {
            title.textContent = '添加日程';
            deleteBtn.style.display = 'none';
            document.getElementById('taskTitle').value = '';
            const now = new Date();
            const h = String(Math.ceil(now.getHours())).padStart(2, '0');
            document.getElementById('taskStart').value = `${h}:00`;
            document.getElementById('taskEnd').value = `${String(Number(h)+1).padStart(2,'0')}:00`;
            document.getElementById('taskCategory').value = 'work';
            document.getElementById('taskPriority').value = 'medium';
            document.getElementById('taskAlarm').checked = true;
            document.getElementById('taskAutoFocus').checked = false;
            document.getElementById('taskNote').value = '';
        }

        modal.classList.add('active');
        setTimeout(() => document.getElementById('taskTitle').focus(), 100);
    },

    closeModal() {
        document.getElementById('taskModal').classList.remove('active');
        this.editingId = null;
    },

    saveTask() {
        const title = document.getElementById('taskTitle').value.trim();
        const startTime = document.getElementById('taskStart').value;
        const endTime = document.getElementById('taskEnd').value;
        const category = document.getElementById('taskCategory').value;
        const priority = document.getElementById('taskPriority').value;
        const alarm = document.getElementById('taskAlarm').checked;
        const autoFocus = document.getElementById('taskAutoFocus').checked;
        const note = document.getElementById('taskNote').value.trim();

        if (!title) { toast('请输入日程名称', 'error'); return; }
        if (!startTime || !endTime) { toast('请设置时间', 'error'); return; }
        if (startTime >= endTime) { toast('结束时间需晚于开始时间', 'error'); return; }

        const taskData = { title, startTime, endTime, category, priority, alarm, autoFocus, note, date: Store.getTodayStr() };

        if (this.editingId) {
            Store.updateTask(this.editingId, taskData);
            toast('日程已更新', 'success');
        } else {
            Store.addTask(taskData);
            toast('日程已添加', 'success');
        }

        this.closeModal();
        this.render();
        AlarmView.render();
        FocusView.refreshTaskSelect();

        // 请求通知权限
        if (alarm) this.requestNotifyPermission();
    },

    deleteTask() {
        if (!this.editingId) return;
        if (confirm('确定要删除这个日程吗？')) {
            Store.deleteTask(this.editingId);
            this.closeModal();
            this.render();
            AlarmView.render();
            FocusView.refreshTaskSelect();
            toast('日程已删除');
        }
    },

    requestNotifyPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }
};

// ===== 闹钟视图 =====
const AlarmView = {
    init() {
        document.getElementById('fullscreenAlarm').addEventListener('change', (e) => {
            Store.data.settings.fullscreenAlarm = e.target.checked;
            Store.save();
        });
        document.getElementById('soundAlarm').addEventListener('change', (e) => {
            Store.data.settings.soundAlarm = e.target.checked;
            Store.save();
        });
        document.getElementById('notifyAlarm').addEventListener('change', (e) => {
            Store.data.settings.notifyAlarm = e.target.checked;
            Store.save();
            if (e.target.checked) ScheduleView.requestNotifyPermission();
        });
        document.getElementById('vibrateAlarm').addEventListener('change', (e) => {
            Store.data.settings.vibrateAlarm = e.target.checked;
            Store.save();
        });
        document.getElementById('forceLockScreen').addEventListener('change', (e) => {
            Store.data.settings.forceLockScreen = e.target.checked;
            ForceLock.enabled = e.target.checked;
            Store.save();
        });
        document.getElementById('snoozeLimit').addEventListener('change', (e) => {
            Store.data.settings.snoozeLimit = parseInt(e.target.value);
            Store.save();
        });
        document.getElementById('alarmVolume').addEventListener('input', (e) => {
            Store.data.settings.alarmVolume = parseInt(e.target.value);
            Store.save();
        });
    },

    render() {
        const tasks = Store.getTodayTasks().filter(t => t.alarm);
        const list = document.getElementById('alarmList');
        const count = document.getElementById('alarmCount');

        count.textContent = `${tasks.length} 个闹钟`;

        list.innerHTML = '';
        if (tasks.length === 0) {
            list.innerHTML = '<div class="empty-state small"><p>暂无闹钟，添加日程时会自动创建</p></div>';
        } else {
            const now = new Date();
            const nowStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
            tasks.forEach(task => {
                const isPassed = task.startTime < nowStr;
                const el = document.createElement('div');
                el.className = 'alarm-item';
                el.innerHTML = `
                    <div class="alarm-item-time">${task.startTime}</div>
                    <div class="alarm-item-info">
                        <div class="alarm-item-name">${ScheduleView.escape(task.title)}</div>
                        <div class="alarm-item-desc">${task.startTime} - ${task.endTime} · ${ScheduleView.catName(task.category)}</div>
                    </div>
                    <div class="alarm-item-status ${task.completed ? 'off' : ''}" title="${isPassed ? '已过' : '待触发'}"></div>
                `;
                list.appendChild(el);
            });
        }

        // 同步设置
        document.getElementById('fullscreenAlarm').checked = Store.data.settings.fullscreenAlarm;
        document.getElementById('soundAlarm').checked = Store.data.settings.soundAlarm;
        document.getElementById('notifyAlarm').checked = Store.data.settings.notifyAlarm;
        document.getElementById('vibrateAlarm').checked = Store.data.settings.vibrateAlarm;
        document.getElementById('forceLockScreen').checked = Store.data.settings.forceLockScreen;
        document.getElementById('snoozeLimit').value = Store.data.settings.snoozeLimit;
        document.getElementById('alarmVolume').value = Store.data.settings.alarmVolume;
    }
};

// ===== 闹钟触发管理 =====
const AlarmTrigger = {
    checkInterval: null,
    triggeredTasks: new Set(),
    snoozeCount: {},
    currentAlarmTask: null,

    init() {
        this.checkInterval = setInterval(() => this.check(), 1000);
    },

    check() {
        const now = new Date();
        const nowStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        const tasks = Store.getTodayTasks();

        for (const task of tasks) {
            if (task.completed) continue;
            if (task.startTime !== nowStr) continue;
            if (this.triggeredTasks.has(task.id)) continue;

            // 避免在同一分钟内重复触发（检查秒数）
            if (now.getSeconds() > 5) continue;

            this.triggeredTasks.add(task.id);
            this.trigger(task);
            break;
        }

        // 每日重置
        if (now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() < 2) {
            this.triggeredTasks.clear();
            this.snoozeCount = {};
        }
    },

    trigger(task) {
        this.currentAlarmTask = task;

        // 浏览器通知
        if (Store.data.settings.notifyAlarm && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('⏰ 日程提醒', {
                body: `${task.title}\n${task.startTime} - ${task.endTime}`,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="%234F46E5"/></svg>',
                requireInteraction: true
            });
        }

        // 震动
        if (Store.data.settings.vibrateAlarm && 'vibrate' in navigator) {
            navigator.vibrate([200, 100, 200, 100, 200, 100, 400]);
        }

        // 声音
        if (Store.data.settings.soundAlarm) {
            AudioMgr.playAlarm();
        }

        // 全屏覆盖
        if (Store.data.settings.fullscreenAlarm) {
            this.showOverlay(task);
        }

        this.snoozeCount[task.id] = 0;
    },

    showOverlay(task) {
        const overlay = document.getElementById('alarmOverlay');
        document.getElementById('alarmTitle').textContent = '日程提醒';
        document.getElementById('alarmTaskName').textContent = task.title;
        document.getElementById('alarmTime').textContent = `${task.startTime} - ${task.endTime}`;

        // 更新贪睡按钮
        this.updateSnoozeBtn(task.id);

        overlay.classList.add('active');

        // 尝试进入全屏
        try { document.documentElement.requestFullscreen(); } catch(e) {}

        // 长按确认
        const confirmBtn = document.getElementById('alarmConfirmBtn');
        const holdProgress = document.getElementById('alarmHoldProgress');
        this.setupHoldButton(confirmBtn, holdProgress, 3000, () => {
            this.confirmAlarm(task);
        });

        // 贪睡
        document.getElementById('alarmSnoozeBtn').onclick = () => this.snooze(task);
    },

    updateSnoozeBtn(taskId) {
        const snoozeBtn = document.getElementById('alarmSnoozeBtn');
        const snoozeText = document.getElementById('snoozeText');
        const remaining = Store.data.settings.snoozeLimit - (this.snoozeCount[taskId] || 0);
        if (remaining <= 0) {
            snoozeBtn.style.display = 'none';
        } else {
            snoozeBtn.style.display = 'inline-flex';
            snoozeText.textContent = `贪睡 5 分钟 (剩余 ${remaining} 次)`;
        }
    },

    snooze(task) {
        const count = this.snoozeCount[task.id] || 0;
        if (count >= Store.data.settings.snoozeLimit) {
            toast('贪睡次数已用完', 'error');
            return;
        }
        this.snoozeCount[task.id] = count + 1;

        // 关闭覆盖层
        document.getElementById('alarmOverlay').classList.remove('active');
        AudioMgr.stop();

        // 5分钟后重新触发
        toast('已贪睡，5分钟后再次提醒', 'warning');
        setTimeout(() => {
            this.triggeredTasks.delete(task.id);
            this.trigger(task);
        }, 5 * 60 * 1000);
    },

    confirmAlarm(task) {
        document.getElementById('alarmOverlay').classList.remove('active');
        AudioMgr.stop();
        toast('开始执行日程！', 'success');

        // 如果设置了自动专注
        if (task.autoFocus) {
            setTimeout(() => {
                FocusView.startFocusWithTask(task);
            }, 500);
        }

        this.currentAlarmTask = null;
    },

    setupHoldButton(btn, progressEl, duration, callback) {
        let timer = null;
        let startTime = 0;
        let isHolding = false;

        const start = (e) => {
            e.preventDefault();
            e.stopPropagation();
            isHolding = true;
            startTime = Date.now();
            btn.style.transform = 'scale(0.95)';

            const update = () => {
                if (!isHolding) return;
                const elapsed = Date.now() - startTime;
                const percent = Math.min(elapsed / duration * 100, 100);
                progressEl.style.width = percent + '%';

                if (elapsed >= duration) {
                    isHolding = false;
                    progressEl.style.width = '0%';
                    btn.style.transform = '';
                    callback();
                } else {
                    requestAnimationFrame(update);
                }
            };
            update();
        };

        const cancel = (e) => {
            if (e) e.preventDefault();
            isHolding = false;
            progressEl.style.width = '0%';
            btn.style.transform = '';
        };

        // 阻止长按弹出菜单
        const preventCtx = (e) => {
            if (isHolding) e.preventDefault();
        };

        btn.addEventListener('mousedown', start);
        btn.addEventListener('touchstart', start, { passive: false });
        btn.addEventListener('mouseup', cancel);
        btn.addEventListener('mouseleave', cancel);
        btn.addEventListener('touchend', cancel);
        btn.addEventListener('touchcancel', cancel);
        btn.addEventListener('contextmenu', preventCtx);
    }
};

// ===== 强制锁屏 =====
const ForceLock = {
    enabled: true,
    active: false,
    leaveCount: 0,
    totalAwaySeconds: 0,
    leaveStartTime: null,
    penaltyMinutes: 0,
    visibilityCheckInterval: null,

    init() {
        // 监听页面离开/返回
        document.addEventListener('visibilitychange', () => this.onVisibilityChange());

        // 阻止关闭/刷新
        window.addEventListener('beforeunload', (e) => this.onBeforeUnload(e));

        // 监听页面隐藏（移动端切换 App）
        document.addEventListener('pagehide', () => this.onPageHide());

        // 设置锁屏按钮
        this.setupLockButtons();
    },

    setupLockButtons() {
        const resumeBtn = document.getElementById('lockResumeBtn');
        const resumeProgress = document.getElementById('lockResumeProgress').querySelector('.hold-progress-fill');
        AlarmTrigger.setupHoldButton(resumeBtn, resumeProgress, 3000, () => {
            this.resume();
        });

        const quitBtn = document.getElementById('lockQuitBtn');
        const quitProgress = document.getElementById('lockQuitProgress').querySelector('.hold-progress-fill');
        AlarmTrigger.setupHoldButton(quitBtn, quitProgress, 5000, () => {
            this.quit();
        });
    },

    start() {
        this.active = true;
        this.leaveCount = 0;
        this.totalAwaySeconds = 0;
        this.penaltyMinutes = 0;
        this.leaveStartTime = null;

        // 如果开启强制锁屏，用定时器持续检测（页面可见性变化有时不触发）
        if (this.enabled) {
            this.visibilityCheckInterval = setInterval(() => {
                if (document.hidden && this.active && !this.leaveStartTime) {
                    this.onLeave();
                }
            }, 2000);
        }
    },

    stop() {
        this.active = false;
        this.leaveStartTime = null;
        if (this.visibilityCheckInterval) {
            clearInterval(this.visibilityCheckInterval);
            this.visibilityCheckInterval = null;
        }
    },

    onBeforeUnload(e) {
        if (!this.enabled || !this.active) return;
        // 浏览器会显示默认提示，这里设置 returnValue 确保触发
        e.preventDefault();
        e.returnValue = '专注模式正在进行中，离开将中断专注并扣除惩罚时间。确定要离开吗？';
        return e.returnValue;
    },

    onVisibilityChange() {
        if (!this.enabled || !this.active) return;

        if (document.hidden) {
            this.onLeave();
        } else {
            this.onReturn();
        }
    },

    onPageHide() {
        if (!this.enabled || !this.active) return;
        this.onLeave();
    },

    onLeave() {
        if (this.leaveStartTime) return; // 已经记录了离开
        this.leaveStartTime = Date.now();
        this.leaveCount++;

        // 震动提醒
        if (Store.data.settings.vibrateAlarm && 'vibrate' in navigator) {
            navigator.vibrate([100, 50, 100]);
        }
    },

    onReturn() {
        if (!this.leaveStartTime) return; // 没有离开记录，忽略

        const awayMs = Date.now() - this.leaveStartTime;
        const awaySeconds = Math.round(awayMs / 1000);
        this.totalAwaySeconds += awaySeconds;
        this.leaveStartTime = null;

        // 低于 3 秒的切出忽略（可能是误触）
        if (awaySeconds < 3) return;

        // 计算惩罚时间（每次离开加 2 分钟，最多 10 分钟）
        const penalty = Math.min(this.leaveCount * 2, 10);
        this.penaltyMinutes = penalty;

        // 显示锁屏
        this.showLockScreen(awaySeconds);
    },

    showLockScreen(awaySeconds) {
        const overlay = document.getElementById('lockScreenOverlay');

        // 格式化离开时长
        let durationText;
        if (awaySeconds < 60) {
            durationText = `${awaySeconds} 秒`;
        } else {
            const mins = Math.floor(awaySeconds / 60);
            const secs = awaySeconds % 60;
            durationText = `${mins} 分 ${secs > 0 ? secs + ' 秒' : ''}`;
        }
        document.getElementById('lockAwayDuration').textContent = durationText;

        // 显示统计（离开次数>=2 时）
        const statsEl = document.getElementById('lockScreenStats');
        if (this.leaveCount >= 2) {
            statsEl.style.display = 'flex';
            document.getElementById('lockTotalAway').textContent = this.leaveCount;
            const totalSecs = this.totalAwaySeconds;
            document.getElementById('lockTotalAwayTime').textContent =
                totalSecs < 60 ? `${totalSecs}s` :
                totalSecs < 3600 ? `${Math.floor(totalSecs / 60)}m${totalSecs % 60}s` :
                `${Math.floor(totalSecs / 3600)}h${Math.floor((totalSecs % 3600) / 60)}m`;
            document.getElementById('lockPenalty').textContent = `${this.penaltyMinutes}m`;
        } else {
            statsEl.style.display = 'none';
        }

        overlay.classList.add('active');

        // 震动
        if (Store.data.settings.vibrateAlarm && 'vibrate' in navigator) {
            navigator.vibrate([300, 100, 300]);
        }
    },

    hideLockScreen() {
        document.getElementById('lockScreenOverlay').classList.remove('active');
    },

    resume() {
        this.hideLockScreen();

        // 应用惩罚时间
        if (this.penaltyMinutes > 0) {
            const penaltySeconds = this.penaltyMinutes * 60;
            FocusView.remaining += penaltySeconds;
            FocusView.totalDuration += penaltySeconds;
            FocusView.updateTimerDisplay();
            toast(`已返回专注，因离开加时 ${this.penaltyMinutes} 分钟`, 'warning');
        } else {
            toast('已返回专注模式', 'success');
        }

        // 重新请求全屏和常亮
        FocusView.requestFullscreenSafe();
        PWA.requestWakeLock();
    },

    quit() {
        this.hideLockScreen();
        FocusView.exitFocusWithPenalty(true, this.leaveCount, this.totalAwaySeconds);
    }
};

// ===== 专注模式 =====
const FocusView = {
    selectedMinutes: 25,
    timer: null,
    remaining: 0,
    totalDuration: 0,
    currentTask: null,
    isRunning: false,
    exitHoldActive: false,

    init() {
        // 时长按钮
        document.querySelectorAll('.duration-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedMinutes = parseInt(btn.dataset.minutes);
            });
        });

        // 开始专注
        document.getElementById('startFocusBtn').addEventListener('click', () => {
            const taskId = document.getElementById('focusTaskSelect').value;
            if (!taskId) { toast('请先选择一个日程', 'error'); return; }
            const task = Store.data.tasks.find(t => t.id === taskId);
            if (task) this.startFocus(task);
        });

        // 紧急退出
        const exitBtn = document.getElementById('focusExitBtn');
        const exitProgress = document.getElementById('focusExitHoldProgress').querySelector('.hold-progress-fill');
        AlarmTrigger.setupHoldButton(exitBtn, exitProgress, 5000, () => {
            this.exitFocus(true);
        });
    },

    refreshTaskSelect() {
        const select = document.getElementById('focusTaskSelect');
        const tasks = Store.getTodayTasks().filter(t => !t.completed);
        select.innerHTML = '';

        if (tasks.length === 0) {
            // 没有可选日程时，添加提示并禁用
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '暂无可用日程，请先添加';
            opt.disabled = true;
            opt.selected = true;
            select.appendChild(opt);
            select.style.color = 'var(--text-tertiary)';

            // 显示提示链接
            let hint = document.getElementById('focusEmptyHint');
            if (!hint) {
                hint = document.createElement('div');
                hint.id = 'focusEmptyHint';
                hint.className = 'focus-empty-hint';
                hint.innerHTML = '还没有今日日程，<a id="goAddTaskLink">去添加日程</a>';
                select.parentElement.appendChild(hint);
                document.getElementById('goAddTaskLink').addEventListener('click', () => {
                    Nav.switchTab('schedule');
                    setTimeout(() => ScheduleView.openModal(), 300);
                });
            }
            hint.style.display = 'block';

            // 禁用开始按钮
            document.getElementById('startFocusBtn').style.opacity = '0.5';
            document.getElementById('startFocusBtn').style.pointerEvents = 'none';
        } else {
            select.style.color = 'var(--text)';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = '选择一个日程...';
            select.appendChild(placeholder);

            tasks.forEach(task => {
                const opt = document.createElement('option');
                opt.value = task.id;
                opt.textContent = `${task.startTime} ${task.title}`;
                select.appendChild(opt);
            });

            // 隐藏提示
            const hint = document.getElementById('focusEmptyHint');
            if (hint) hint.style.display = 'none';

            // 恢复开始按钮
            document.getElementById('startFocusBtn').style.opacity = '';
            document.getElementById('startFocusBtn').style.pointerEvents = '';
        }
    },

    startFocusWithTask(task) {
        this.selectedMinutes = 25; // 默认25分钟
        this.startFocus(task);
    },

    startFocus(task) {
        this.currentTask = task;
        this.totalDuration = this.selectedMinutes * 60;
        this.remaining = this.totalDuration;
        this.isRunning = true;

        // 激活强制锁屏
        ForceLock.start();

        // 显示专注覆盖层
        const overlay = document.getElementById('focusOverlay');
        overlay.classList.remove('completed');
        document.getElementById('focusTaskName').textContent = task.title;

        // 显示限制应用列表
        const restricted = Store.data.restrictedApps;
        document.getElementById('focusRestrictedCount').textContent = restricted.length;
        const itemsEl = document.getElementById('focusRestrictedItems');
        itemsEl.innerHTML = restricted.map(app => `<span class="focus-restricted-tag">${RestrictView.catEmoji(app.category)} ${ScheduleView.escape(app.name)}</span>`).join('');

        overlay.classList.add('active');

        // 尝试进入全屏（移动端可能不支持）
        this.requestFullscreenSafe();

        // 屏幕常亮（防止专注时息屏）
        PWA.requestWakeLock();

        // 限制预览
        const preview = restricted.slice(0, 5).map(a => a.name).join('、');
        document.getElementById('restrictedAppsPreview').textContent = preview + (restricted.length > 5 ? ' 等' : '');

        // 开始计时
        this.updateTimerDisplay();
        this.timer = setInterval(() => this.tick(), 1000);

        toast('专注模式已开启', 'success');
        Nav.switchTab('focus');

        // 监听全屏退出
        document.addEventListener('fullscreenchange', this.onFullscreenChange);
        document.addEventListener('webkitfullscreenchange', this.onFullscreenChange);
    },

    requestFullscreenSafe() {
        const el = document.documentElement;
        // 检测是否支持全屏 API
        const hasFullscreen = !!(
            el.requestFullscreen ||
            el.webkitRequestFullscreen ||
            el.msRequestFullscreen
        );

        if (hasFullscreen) {
            try {
                if (el.requestFullscreen) {
                    el.requestFullscreen();
                } else if (el.webkitRequestFullscreen) {
                    el.webkitRequestFullscreen();
                } else if (el.msRequestFullscreen) {
                    el.msRequestFullscreen();
                }
            } catch(e) {
                console.warn('Fullscreen request failed:', e);
                this.simulateFullscreen();
            }
        } else {
            // iOS Safari 等不支持全屏 API，用 CSS 模拟
            this.simulateFullscreen();
        }
    },

    simulateFullscreen() {
        // iOS Safari: 滚动到顶部隐藏地址栏
        try {
            window.scrollTo(0, 1);
            document.body.scrollTop = 0;
        } catch(e) {}

        // 标记为非原生全屏模式
        this._nativeFullscreen = false;
    },

    onFullscreenChange() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement && FocusView.isRunning) {
            // 全屏被退出，显示警告
            toast('请保持专注！退出全屏会影响专注效果', 'warning');
            // 尝试重新进入全屏
            setTimeout(() => {
                if (FocusView.isRunning) {
                    FocusView.requestFullscreenSafe();
                }
            }, 1000);
        }
    },

    tick() {
        this.remaining--;
        if (this.remaining <= 0) {
            this.completeFocus();
            return;
        }
        this.updateTimerDisplay();
    },

    updateTimerDisplay() {
        const mins = Math.floor(this.remaining / 60);
        const secs = this.remaining % 60;
        document.getElementById('focusTimerDisplay').textContent =
            `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;

        const circumference = 2 * Math.PI * 130;
        const percent = this.remaining / this.totalDuration;
        const offset = circumference - percent * circumference;
        document.getElementById('focusTimerRing').style.strokeDashoffset = offset;

        // 最后10秒每秒提示音
        if (this.remaining <= 10 && this.remaining > 0) {
            AudioMgr.playTick();
        }
    },

    completeFocus() {
        clearInterval(this.timer);
        this.isRunning = false;

        // 释放屏幕常亮和锁屏监控
        PWA.releaseWakeLock();
        ForceLock.stop();

        // 记录专注时长
        const minutes = Math.round(this.totalDuration / 60);
        Store.addFocusTime(minutes);
        Store.addFocusHistory(this.currentTask.title, minutes);

        // 播放完成音效
        AudioMgr.playSuccess();

        // 显示完成状态
        const overlay = document.getElementById('focusOverlay');
        overlay.classList.add('completed');
        document.getElementById('focusTimerDisplay').textContent = '完成！';
        document.getElementById('focusTimerLabel').textContent = '专注完成';

        // 震动
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200, 100, 400]);

        toast(`专注完成！用时 ${minutes} 分钟`, 'success');

        // 3秒后退出
        setTimeout(() => {
            overlay.classList.remove('active', 'completed');
            document.getElementById('focusTimerLabel').textContent = '剩余时间';
            this.resetTimerRing();
            // 退出全屏
            this.exitFullscreenSafe();
            document.removeEventListener('fullscreenchange', this.onFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', this.onFullscreenChange);

            ScheduleView.render();
            StatsView.render();
        }, 3000);
    },

    exitFocus(emergency) {
        clearInterval(this.timer);
        this.isRunning = false;

        // 释放屏幕常亮和锁屏监控
        PWA.releaseWakeLock();
        ForceLock.stop();

        const elapsed = this.totalDuration - this.remaining;
        const minutes = Math.round(elapsed / 60);

        if (minutes > 0) {
            Store.addFocusTime(minutes);
            Store.addFocusHistory(this.currentTask.title + ' (中断)', minutes);
        }

        AudioMgr.stop();

        const overlay = document.getElementById('focusOverlay');
        overlay.classList.remove('active');
        this.resetTimerRing();

        this.exitFullscreenSafe();
        document.removeEventListener('fullscreenchange', this.onFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', this.onFullscreenChange);

        toast(emergency ? '已紧急退出专注模式' : '已退出专注模式', 'warning');
        ScheduleView.render();
        StatsView.render();
    },

    // 带惩罚信息的退出（从锁屏放弃时调用）
    exitFocusWithPenalty(emergency, leaveCount, awaySeconds) {
        clearInterval(this.timer);
        this.isRunning = false;

        // 释放屏幕常亮和锁屏监控
        PWA.releaseWakeLock();
        ForceLock.stop();

        const elapsed = this.totalDuration - this.remaining;
        const minutes = Math.round(elapsed / 60);

        // 记录逃避行为
        const awayMins = Math.round(awaySeconds / 60);
        const label = leaveCount > 1
            ? `${this.currentTask.title} (放弃·离开${leaveCount}次共${awayMins}分钟)`
            : `${this.currentTask.title} (放弃·离开${awayMins}分钟)`;

        if (minutes > 0) {
            Store.addFocusTime(minutes);
            Store.addFocusHistory(label, minutes);
        } else {
            Store.addFocusHistory(label, 0);
        }

        AudioMgr.stop();

        const overlay = document.getElementById('focusOverlay');
        overlay.classList.remove('active');
        this.resetTimerRing();

        this.exitFullscreenSafe();
        document.removeEventListener('fullscreenchange', this.onFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', this.onFullscreenChange);

        toast('已放弃专注模式，逃避行为已记录', 'error');
        ScheduleView.render();
        StatsView.render();
    },

    exitFullscreenSafe() {
        try {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else if (document.webkitFullscreenElement) {
                document.webkitExitFullscreen();
            }
        } catch(e) {}
    },

    resetTimerRing() {
        document.getElementById('focusTimerRing').style.strokeDashoffset = 0;
        document.getElementById('focusTimerDisplay').textContent = `${String(this.selectedMinutes).padStart(2,'0')}:00`;
    }
};

// ===== 应用限制视图 =====
const RestrictView = {
    init() {
        document.getElementById('addRestrictBtn').addEventListener('click', () => this.openModal());
        document.getElementById('restrictModalClose').addEventListener('click', () => this.closeModal());
        document.getElementById('restrictCancelBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('restrictSaveBtn').addEventListener('click', () => this.save());
        document.getElementById('restrictModal').addEventListener('click', (e) => {
            if (e.target.id === 'restrictModal') this.closeModal();
        });
    },

    catEmoji(cat) {
        return { game: '🎮', video: '📱', social: '💬', other: '🌐' }[cat] || '🌐';
    },

    catLabel(cat) {
        return { game: '游戏', video: '短视频', social: '社交', other: '其他' }[cat] || '其他';
    },

    render() {
        const apps = Store.data.restrictedApps;
        const grid = document.getElementById('restrictGrid');

        grid.innerHTML = '';
        apps.forEach((app, index) => {
            const el = document.createElement('div');
            el.className = 'restrict-item';
            el.innerHTML = `
                <div class="restrict-item-icon">${this.catEmoji(app.category)}</div>
                <div class="restrict-item-info">
                    <div class="restrict-item-name">${ScheduleView.escape(app.name)}</div>
                    <div class="restrict-item-cat">${this.catLabel(app.category)}</div>
                </div>
                <div class="restrict-item-delete" data-index="${index}">&times;</div>
            `;
            el.querySelector('.restrict-item-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                Store.removeRestriction(index);
                this.render();
                toast('已移除限制应用');
            });
            grid.appendChild(el);
        });

        // 统计
        const counts = { game: 0, video: 0, social: 0, other: 0 };
        apps.forEach(a => counts[a.category]++);
        document.getElementById('gameRestrictCount').textContent = counts.game + ' 个';
        document.getElementById('videoRestrictCount').textContent = counts.video + ' 个';
        document.getElementById('socialRestrictCount').textContent = counts.social + ' 个';
        document.getElementById('otherRestrictCount').textContent = counts.other + ' 个';
    },

    openModal() {
        document.getElementById('restrictName').value = '';
        document.getElementById('restrictCategory').value = 'video';
        document.getElementById('restrictModal').classList.add('active');
        setTimeout(() => document.getElementById('restrictName').focus(), 100);
    },

    closeModal() {
        document.getElementById('restrictModal').classList.remove('active');
    },

    save() {
        const name = document.getElementById('restrictName').value.trim();
        const category = document.getElementById('restrictCategory').value;
        if (!name) { toast('请输入应用名称', 'error'); return; }

        // 检查重复
        if (Store.data.restrictedApps.some(a => a.name === name)) {
            toast('该应用已在限制列表中', 'error');
            return;
        }

        Store.addRestriction({ name, category });
        this.closeModal();
        this.render();
        toast('已添加限制应用', 'success');
    }
};

// ===== 推荐日程库 =====
const RecommendView = {
    currentFilter: 'all',
    currentSearch: '',
    selectedSchedule: null,

    // 基于联网搜索真实数据整理的推荐日程库
    schedules: [
        {
            id: 'musk',
            icon: '🚀',
            title: '马斯克典型作息',
            category: 'celebrity',
            source: 'BusinessInsider / 华尔街日报',
            desc: '全球首富马斯克的一天：高强度工作、6小时睡眠、凌晨3点就寝。以"最紧迫危机"为导向分配时间。',
            items: [
                { time: '09:00', end: '09:30', name: '起床与早餐（牛排、鸡蛋、咖啡）', cat: 'life', priority: 'low' },
                { time: '09:30', end: '10:00', name: '查看手机处理紧急事务', cat: 'work', priority: 'high' },
                { time: '10:00', end: '10:30', name: '淋浴思考', cat: 'life', priority: 'low' },
                { time: '10:30', end: '12:30', name: 'Tesla/SpaceX 核心工作', cat: 'work', priority: 'high' },
                { time: '12:30', end: '13:00', name: '简短午餐或小食', cat: 'life', priority: 'medium' },
                { time: '13:00', end: '16:00', name: '深度技术攻关（火箭科学时间）', cat: 'work', priority: 'high' },
                { time: '16:00', end: '18:00', name: '会议与跨公司协调', cat: 'work', priority: 'medium' },
                { time: '18:00', end: '20:00', name: '晚餐外出就餐', cat: 'life', priority: 'low' },
                { time: '20:00', end: '02:00', name: '继续工作 / AI项目 / X平台', cat: 'work', priority: 'high' },
                { time: '03:00', end: '09:00', name: '就寝（约6小时睡眠）', cat: 'life', priority: 'medium' }
            ]
        },
        {
            id: 'leijun',
            icon: '⏰',
            title: '雷军高效一日',
            category: 'celebrity',
            source: '雷军微博 / 头条新闻',
            desc: '小米创始人雷军的作息：5点起床健身、周末不歇、深夜复盘。把时间当尺子，刻得越细装得越多。',
            items: [
                { time: '05:00', end: '06:00', name: '起床健身打卡', cat: 'exercise', priority: 'high' },
                { time: '06:00', end: '07:00', name: '个人思考与规划', cat: 'work', priority: 'high' },
                { time: '07:00', end: '09:00', name: '研发中心巡视与思考', cat: 'work', priority: 'high' },
                { time: '09:00', end: '12:00', name: '核心业务：产品发布会筹备', cat: 'work', priority: 'high' },
                { time: '12:00', end: '13:00', name: '午餐', cat: 'life', priority: 'medium' },
                { time: '14:00', end: '17:00', name: '技术团队深度讨论（3小时）', cat: 'work', priority: 'high' },
                { time: '17:00', end: '18:00', name: '处理邮件与事务', cat: 'work', priority: 'medium' },
                { time: '18:00', end: '20:00', name: '晚餐与短暂休息', cat: 'life', priority: 'low' },
                { time: '20:00', end: '22:00', name: '直播与用户交流', cat: 'work', priority: 'medium' },
                { time: '22:00', end: '23:00', name: '复盘当日、规划明日', cat: 'work', priority: 'high' },
                { time: '23:30', end: '05:00', name: '就寝', cat: 'life', priority: 'medium' }
            ]
        },
        {
            id: 'morning_routine',
            icon: '🌅',
            title: '成功人士晨间仪式',
            category: 'celebrity',
            source: '头条 / 商业内幕',
            desc: '库克4:30起床、盖茨晨读1小时、布兰森晨练。晨间仪式感藏着共同法则：身体唤醒+认知充电+目标规划。',
            items: [
                { time: '05:00', end: '05:15', name: '起床、饮水、简单拉伸', cat: 'life', priority: 'medium' },
                { time: '05:15', end: '06:15', name: '晨练（跑步/健身/瑜伽）', cat: 'exercise', priority: 'high' },
                { time: '06:15', end: '06:30', name: '淋浴', cat: 'life', priority: 'low' },
                { time: '06:30', end: '07:30', name: '深度阅读1小时', cat: 'study', priority: 'high' },
                { time: '07:30', end: '08:00', name: '健康早餐', cat: 'life', priority: 'medium' },
                { time: '08:00', end: '08:30', name: '规划今日3件最重要的事（MITs）', cat: 'work', priority: 'high' },
                { time: '08:30', end: '11:30', name: '黄金90分钟深度工作', cat: 'work', priority: 'high' },
                { time: '11:30', end: '12:00', name: '处理邮件与小任务', cat: 'work', priority: 'medium' },
                { time: '12:00', end: '13:00', name: '午餐与散步', cat: 'life', priority: 'low' }
            ]
        },
        {
            id: 'kaoyan',
            icon: '📚',
            title: '考研高效学习时间表',
            category: 'study',
            source: '新东方考研 / 中国研究生招生信息网',
            desc: '黄金时段攻难点、碎片时间记背、每学必复盘。保证7小时睡眠，早起比熬夜更高效。',
            items: [
                { time: '06:30', end: '07:00', name: '起床洗漱早餐', cat: 'life', priority: 'medium' },
                { time: '07:00', end: '08:00', name: '晨间记忆：英语单词/政治考点', cat: 'study', priority: 'high' },
                { time: '08:00', end: '10:00', name: '第一黄金时段：数学/专业课重难点', cat: 'study', priority: 'high' },
                { time: '10:10', end: '12:00', name: '专业课系统学习/真题训练', cat: 'study', priority: 'high' },
                { time: '12:00', end: '14:00', name: '午餐+午休（30-40分钟）', cat: 'life', priority: 'medium' },
                { time: '14:00', end: '16:00', name: '第二黄金时段：英语真题精做', cat: 'study', priority: 'high' },
                { time: '16:10', end: '17:40', name: '政治学习：听课+选择题刷题', cat: 'study', priority: 'medium' },
                { time: '17:40', end: '19:00', name: '晚餐+放松+轻度运动', cat: 'life', priority: 'low' },
                { time: '19:00', end: '21:30', name: '晚间深度学习：复盘+弱项补漏', cat: 'study', priority: 'high' },
                { time: '21:30', end: '22:20', name: '当日复盘+明日计划', cat: 'study', priority: 'high' },
                { time: '22:30', end: '06:30', name: '放松洗漱入睡', cat: 'life', priority: 'medium' }
            ]
        },
        {
            id: 'deep_work',
            icon: '🧠',
            title: '深度工作90分钟块',
            category: 'study',
            source: 'Cal Newport《深度工作》/ 新东方考研',
            desc: '90分钟是大多数人保持高度专注的极限。每天3-4个深度块，中间休息15-30分钟。真正提分的是深度工作。',
            items: [
                { time: '08:00', end: '09:30', name: '深度块1：最难的核心任务', cat: 'work', priority: 'high' },
                { time: '09:30', end: '09:45', name: '休息：走动、深呼吸', cat: 'life', priority: 'low' },
                { time: '09:45', end: '11:15', name: '深度块2：第二大任务', cat: 'work', priority: 'high' },
                { time: '11:15', end: '12:00', name: '处理邮件、消息回复', cat: 'work', priority: 'medium' },
                { time: '12:00', end: '13:00', name: '午餐与散步', cat: 'life', priority: 'low' },
                { time: '14:00', end: '15:30', name: '深度块3：创意/分析任务', cat: 'work', priority: 'high' },
                { time: '15:30', end: '16:00', name: '长休息：闭眼休息、喝水', cat: 'life', priority: 'low' },
                { time: '16:00', end: '17:30', name: '深度块4：复盘与总结', cat: 'work', priority: 'medium' },
                { time: '18:00', end: '19:00', name: '晚餐', cat: 'life', priority: 'low' },
                { time: '19:30', end: '20:00', name: '睡前复盘：3个收获', cat: 'study', priority: 'medium' }
            ]
        },
        {
            id: 'pomodoro',
            icon: '🍅',
            title: '番茄工作法日程',
            category: 'work',
            source: '番茄工作法完整指南 / RyanLifeHack',
            desc: '25分钟专注+5分钟休息，每4个番茄钟长休息。一天约13-15个番茄钟=5-6小时高品质专注时间。',
            items: [
                { time: '08:00', end: '08:05', name: '规划今日任务与番茄钟预估', cat: 'work', priority: 'high' },
                { time: '08:05', end: '10:00', name: '深度工作（4个番茄钟25+5）', cat: 'work', priority: 'high' },
                { time: '10:00', end: '10:30', name: '长休息：散步、喝咖啡', cat: 'life', priority: 'low' },
                { time: '10:30', end: '12:00', name: '深度工作（3个番茄钟）', cat: 'work', priority: 'high' },
                { time: '12:00', end: '13:00', name: '午餐完全休息', cat: 'life', priority: 'medium' },
                { time: '13:00', end: '13:30', name: '回复消息邮件（2个短番茄钟）', cat: 'work', priority: 'medium' },
                { time: '13:30', end: '15:30', name: '下午深度工作（4个番茄钟）', cat: 'work', priority: 'high' },
                { time: '15:30', end: '16:00', name: '长休息：走动、聊天', cat: 'life', priority: 'low' },
                { time: '16:00', end: '17:00', name: '收尾整理（2个番茄钟）', cat: 'work', priority: 'medium' },
                { time: '17:00', end: '17:15', name: '日终复盘与明日准备', cat: 'work', priority: 'medium' }
            ]
        },
        {
            id: 'time_block',
            icon: '🗓️',
            title: '时间块管理工作日',
            category: 'work',
            source: '时间管理方法 / 头条',
            desc: '把日历按任务类型分块（深度工作、会议、邮件、休息），深度块50-90分钟。先做最重要的事（MITs）。',
            items: [
                { time: '08:30', end: '09:00', name: '早读/计划：确定今日3件MIT', cat: 'work', priority: 'high' },
                { time: '09:00', end: '11:00', name: '深度工作块（MIT1）关通知', cat: 'work', priority: 'high' },
                { time: '11:00', end: '11:30', name: '批量处理邮件/小任务', cat: 'work', priority: 'medium' },
                { time: '11:30', end: '12:30', name: '午餐/散步恢复精力', cat: 'life', priority: 'low' },
                { time: '13:30', end: '15:30', name: '深度工作块（MIT2）或会议', cat: 'work', priority: 'high' },
                { time: '15:30', end: '16:00', name: '休息/回邮件', cat: 'work', priority: 'low' },
                { time: '16:00', end: '17:00', name: '次要任务/学习', cat: 'study', priority: 'medium' },
                { time: '17:00', end: '17:15', name: '日终复盘与明天计划', cat: 'work', priority: 'medium' }
            ]
        },
        {
            id: 'wfh_programmer',
            icon: '💻',
            title: '程序员居家办公(WFH)作息',
            category: 'programmer',
            source: 'CSDN / 51CTO / 远程工作指南',
            desc: '严格划分工作与生活边界，每45分钟起身活动。上午深度编码，下午会议沟通，23点硬截止入睡。',
            items: [
                { time: '06:30', end: '07:00', name: '起床饮水+猫式伸展+拉伸', cat: 'life', priority: 'medium' },
                { time: '07:00', end: '07:40', name: '营养早餐+轻度活动', cat: 'life', priority: 'low' },
                { time: '07:40', end: '08:30', name: '换装整理工作环境（别穿睡衣！）', cat: 'work', priority: 'medium' },
                { time: '08:30', end: '10:00', name: '深度工作：架构设计/复杂问题', cat: 'work', priority: 'high' },
                { time: '10:00', end: '10:15', name: '加餐+远眺+眼保健操', cat: 'life', priority: 'low' },
                { time: '10:15', end: '11:45', name: '深度工作：代码评审/技术方案', cat: 'work', priority: 'high' },
                { time: '11:45', end: '12:30', name: '午餐（远离电脑）', cat: 'life', priority: 'medium' },
                { time: '12:30', end: '13:15', name: '平躺午休20-30分钟', cat: 'life', priority: 'medium' },
                { time: '13:15', end: '14:45', name: '常规工作：会议/沟通/文档', cat: 'work', priority: 'medium' },
                { time: '14:45', end: '15:00', name: '休息拉伸', cat: 'life', priority: 'low' },
                { time: '15:00', end: '17:00', name: '编码开发：写代码→测试→PR', cat: 'work', priority: 'high' },
                { time: '17:00', end: '18:00', name: '收尾：总结状态+明日安排', cat: 'work', priority: 'medium' },
                { time: '18:00', end: '19:00', name: '晚餐+散步', cat: 'life', priority: 'low' },
                { time: '19:00', end: '21:00', name: '技能学习：在线课程/书籍', cat: 'study', priority: 'medium' },
                { time: '21:00', end: '22:00', name: '复盘+次日计划', cat: 'work', priority: 'medium' },
                { time: '22:30', end: '06:30', name: '入睡（23点硬截止）', cat: 'life', priority: 'medium' }
            ]
        },
        {
            id: 'remote_coder',
            icon: '☕',
            title: '远程开发者咖啡店日程',
            category: 'programmer',
            source: '远程工作者社区 / zjb.xmf.com',
            desc: '去咖啡店工作、上午写代码发PR、下午算法kata+密集编码、晚上家庭时间。工作与生活清晰切换。',
            items: [
                { time: '08:40', end: '09:00', name: '去咖啡店点一杯拿铁', cat: 'life', priority: 'low' },
                { time: '09:00', end: '09:30', name: '查看Slack/邮件，确定今日优先级', cat: 'work', priority: 'medium' },
                { time: '09:30', end: '11:00', name: '写代码→写测试→发Pull Request', cat: 'work', priority: 'high' },
                { time: '11:00', end: '11:30', name: '团队会议', cat: 'work', priority: 'medium' },
                { time: '11:30', end: '11:45', name: '刷GitHub/HackerNews/技术资讯', cat: 'study', priority: 'low' },
                { time: '11:45', end: '12:30', name: '午餐', cat: 'life', priority: 'medium' },
                { time: '12:30', end: '13:20', name: '运动/休息', cat: 'exercise', priority: 'low' },
                { time: '13:30', end: '14:00', name: '算法题kata / typing练习', cat: 'study', priority: 'medium' },
                { time: '14:00', end: '15:30', name: '密集编码、重构、发PR、更新文档', cat: 'work', priority: 'high' },
                { time: '16:30', end: '17:30', name: 'Review PR + 重构 + Slack总结', cat: 'work', priority: 'medium' },
                { time: '19:00', end: '22:00', name: '家庭时间：晚餐、散步、亲子', cat: 'life', priority: 'medium' },
                { time: '22:30', end: '24:00', name: '看Slack+写文字/代码', cat: 'work', priority: 'low' },
                { time: '24:00', end: '08:00', name: '就寝', cat: 'life', priority: 'medium' }
            ]
        },
        {
            id: 'student_balance',
            icon: '🎓',
            title: '在校学生平衡作息',
            category: 'study',
            source: '考研社区 / 新东方',
            desc: '适配课多在校生：早晨背诵、课间刷题、没课时主攻数学专业课、晚间真题复盘。每天有效学习8小时+。',
            items: [
                { time: '06:30', end: '07:30', name: '起床+单词+背诵', cat: 'study', priority: 'high' },
                { time: '07:30', end: '08:00', name: '早餐', cat: 'life', priority: 'medium' },
                { time: '08:00', end: '10:00', name: '高效主攻：数学/专业课重难点', cat: 'study', priority: 'high' },
                { time: '10:10', end: '12:00', name: '专项巩固：习题训练+错题整理', cat: 'study', priority: 'high' },
                { time: '12:00', end: '14:00', name: '午餐+午休（不超1小时）', cat: 'life', priority: 'medium' },
                { time: '14:00', end: '16:30', name: '第二学习时段：文科/背诵/真题', cat: 'study', priority: 'high' },
                { time: '16:40', end: '18:00', name: '查漏补缺+弱科补强', cat: 'study', priority: 'medium' },
                { time: '18:00', end: '19:00', name: '晚餐+散步+放空大脑', cat: 'life', priority: 'low' },
                { time: '19:00', end: '21:30', name: '晚间强化：政治/专业课大题', cat: 'study', priority: 'high' },
                { time: '21:40', end: '22:30', name: '当日复盘+次日规划', cat: 'study', priority: 'medium' },
                { time: '23:00', end: '06:30', name: '入睡', cat: 'life', priority: 'medium' }
            ]
        }
    ],

    init() {
        // 搜索
        document.getElementById('recommendSearch').addEventListener('input', (e) => {
            this.currentSearch = e.target.value.toLowerCase().trim();
            this.render();
        });

        // 筛选
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.currentFilter = chip.dataset.filter;
                this.render();
            });
        });

        // 弹窗
        document.getElementById('recommendModalClose').addEventListener('click', () => this.closePreview());
        document.getElementById('recommendCancelBtn').addEventListener('click', () => this.closePreview());
        document.getElementById('recommendCopyBtn').addEventListener('click', () => this.copyToToday());
        document.getElementById('recommendModal').addEventListener('click', (e) => {
            if (e.target.id === 'recommendModal') this.closePreview();
        });
    },

    catLabel(cat) {
        return { work: '工作', study: '学习', exercise: '运动', life: '生活', other: '其他' }[cat] || '其他';
    },

    catEmoji(cat) {
        return { work: '💼', study: '📚', exercise: '🏃', life: '🏠', other: '📌' }[cat] || '📌';
    },

    categoryLabel(cat) {
        return { celebrity: '名人作息', study: '学习备考', work: '工作效率', programmer: '程序员' }[cat] || '其他';
    },

    getFiltered() {
        return this.schedules.filter(s => {
            const matchFilter = this.currentFilter === 'all' || s.category === this.currentFilter;
            const matchSearch = !this.currentSearch ||
                s.title.toLowerCase().includes(this.currentSearch) ||
                s.desc.toLowerCase().includes(this.currentSearch) ||
                s.source.toLowerCase().includes(this.currentSearch) ||
                s.items.some(i => i.name.toLowerCase().includes(this.currentSearch));
            return matchFilter && matchSearch;
        });
    },

    render() {
        const filtered = this.getFiltered();
        const grid = document.getElementById('recommendGrid');
        document.getElementById('recommendCount').textContent = `${filtered.length} 套`;

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1; padding: 48px 20px;">
                    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <h3>没有找到匹配的日程</h3>
                    <p>试试其他关键词，如"考研""番茄""程序员"</p>
                </div>`;
            return;
        }

        grid.innerHTML = '';
        filtered.forEach(s => {
            const card = document.createElement('div');
            card.className = 'recommend-card';
            const previewItems = s.items.slice(0, 4);
            card.innerHTML = `
                <div class="recommend-card-header">
                    <div class="recommend-card-title-wrap">
                        <div class="recommend-card-icon">${s.icon}</div>
                        <div class="recommend-card-title">${s.title}</div>
                        <div class="recommend-card-source">来源：${s.source}</div>
                    </div>
                    <span class="recommend-card-category ${s.category}">${this.categoryLabel(s.category)}</span>
                </div>
                <p class="recommend-card-desc">${s.desc}</p>
                <div class="recommend-card-preview">
                    ${previewItems.map(i => `
                        <div class="recommend-preview-item">
                            <span class="recommend-preview-time">${i.time}</span>
                            <span class="recommend-preview-name">${i.name}</span>
                        </div>
                    `).join('')}
                    ${s.items.length > 4 ? `<div class="recommend-preview-item" style="color:var(--text-tertiary);font-size:12px;">... 共 ${s.items.length} 项日程</div>` : ''}
                </div>
                <div class="recommend-card-footer">
                    <div class="recommend-card-meta">
                        <span>📅 ${s.items.length} 项</span>
                        <span>⏱️ ${this.calcDuration(s.items)}</span>
                    </div>
                    <button class="recommend-card-copy-btn" data-id="${s.id}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        查看并复制
                    </button>
                </div>
            `;
            card.addEventListener('click', () => this.openPreview(s));
            grid.appendChild(card);
        });
    },

    calcDuration(items) {
        let totalMin = 0;
        items.forEach(i => {
            const [sh, sm] = i.time.split(':').map(Number);
            const [eh, em] = i.end.split(':').map(Number);
            let diff = (eh * 60 + em) - (sh * 60 + sm);
            if (diff <= 0) diff += 24 * 60; // 跨天
            totalMin += diff;
        });
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        return h > 0 ? `${h}h${m > 0 ? m + 'm' : ''}` : `${m}m`;
    },

    openPreview(schedule) {
        this.selectedSchedule = schedule;
        document.getElementById('recommendModalTitle').textContent = schedule.title;

        const info = document.getElementById('recommendPreviewInfo');
        info.innerHTML = `
            <strong>来源：</strong>${schedule.source}<br>
            <strong>总时长：</strong>${this.calcDuration(schedule.items)} · ${schedule.items.length} 项日程<br>
            <strong>简介：</strong>${schedule.desc}
        `;

        const timeline = document.getElementById('recommendPreviewTimeline');
        timeline.innerHTML = schedule.items.map(i => `
            <div class="recommend-timeline-item">
                <div class="recommend-timeline-time">${i.time} - ${i.end}</div>
                <div class="recommend-timeline-body">
                    <div class="recommend-timeline-name">${this.catEmoji(i.cat)} ${i.name}</div>
                    <div class="recommend-timeline-cat">${this.catLabel(i.cat)} · ${i.priority === 'high' ? '高优先级' : i.priority === 'medium' ? '中优先级' : '低优先级'}</div>
                </div>
            </div>
        `).join('');

        document.getElementById('recommendModal').classList.add('active');
    },

    closePreview() {
        document.getElementById('recommendModal').classList.remove('active');
        this.selectedSchedule = null;
    },

    copyToToday() {
        if (!this.selectedSchedule) return;
        const schedule = this.selectedSchedule;

        let added = 0;
        schedule.items.forEach(item => {
            Store.addTask({
                title: item.name,
                startTime: item.time,
                endTime: item.end,
                category: item.cat,
                priority: item.priority,
                alarm: true,
                autoFocus: false,
                note: `来自「${schedule.title}」推荐日程`
            });
            added++;
        });

        this.closePreview();
        toast(`已复制 ${added} 项日程到今日！`, 'success');
        ScheduleView.render();
        AlarmView.render();
        FocusView.refreshTaskSelect();
        Nav.switchTab('schedule');
    }
};

// ===== 统计视图 =====
const StatsView = {
    render() {
        const stats = Store.data.stats;
        document.getElementById('totalCompleted').textContent = stats.totalCompleted;

        const focusMin = stats.totalFocusTime;
        document.getElementById('totalFocusTime').textContent = focusMin >= 60 ?
            `${Math.floor(focusMin/60)}h${focusMin%60 > 0 ? focusMin%60+'m' : ''}` : `${focusMin}m`;

        document.getElementById('totalStreak').textContent = stats.streak;

        const totalTasks = Store.data.tasks.length;
        const completedTasks = Store.data.tasks.filter(t => t.completed).length;
        const rate = totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0;
        document.getElementById('completionRate').textContent = rate + '%';

        this.renderChart();
        this.renderHistory();
    },

    renderChart() {
        const canvas = document.getElementById('weeklyChart');
        const ctx = canvas.getContext('2d');
        const data = Store.data.stats.weeklyFocus;
        const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        const today = new Date().getDay();
        const todayIdx = today === 0 ? 6 : today - 1;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = 240 * dpr;
        ctx.scale(dpr, dpr);
        const W = rect.width;
        const H = 240;

        ctx.clearRect(0, 0, W, H);

        const maxVal = Math.max(...data, 30);
        const padding = { top: 20, right: 20, bottom: 40, left: 40 };
        const chartW = W - padding.left - padding.right;
        const chartH = H - padding.top - padding.bottom;
        const barW = chartW / 7 * 0.6;
        const gap = chartW / 7 * 0.4;

        // Y轴
        ctx.strokeStyle = '#E5E7EB';
        ctx.fillStyle = '#9CA3AF';
        ctx.font = '11px sans-serif';
        ctx.lineWidth = 1;

        const gridLines = 4;
        for (let i = 0; i <= gridLines; i++) {
            const y = padding.top + (chartH / gridLines) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(W - padding.right, y);
            ctx.stroke();
            const val = Math.round(maxVal * (1 - i / gridLines));
            ctx.textAlign = 'right';
            ctx.fillText(val + 'm', padding.left - 6, y + 4);
        }

        // 柱状图
        data.forEach((val, i) => {
            const x = padding.left + (chartW / 7) * i + gap / 2;
            const barH = (val / maxVal) * chartH;
            const y = padding.top + chartH - barH;

            if (i === todayIdx) {
                ctx.fillStyle = '#4F46E5';
            } else if (val > 0) {
                ctx.fillStyle = '#818CF8';
            } else {
                ctx.fillStyle = '#E5E7EB';
            }

            const radius = 4;
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + barW - radius, y);
            ctx.quadraticCurveTo(x + barW, y, x + barW, y + radius);
            ctx.lineTo(x + barW, y + barH);
            ctx.lineTo(x, y + barH);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.fill();

            // 数值
            if (val > 0) {
                ctx.fillStyle = '#1F2937';
                ctx.textAlign = 'center';
                ctx.fillText(val + 'm', x + barW / 2, y - 6);
            }

            // 日期标签
            ctx.fillStyle = i === todayIdx ? '#4F46E5' : '#9CA3AF';
            ctx.textAlign = 'center';
            ctx.font = i === todayIdx ? 'bold 12px sans-serif' : '11px sans-serif';
            ctx.fillText(days[i], x + barW / 2, H - padding.bottom + 20);
        });
    },

    renderHistory() {
        const list = document.getElementById('historyList');
        const history = Store.data.stats.history;

        if (history.length === 0) {
            list.innerHTML = '<div class="empty-state small"><p>暂无记录，完成日程后这里会显示</p></div>';
            return;
        }

        list.innerHTML = '';
        history.slice(0, 20).forEach(item => {
            const el = document.createElement('div');
            el.className = 'history-item';
            const icon = item.type === 'task' ? '✅' : '🎯';
            const badgeText = item.type === 'task' ? '完成' : `专注 ${item.duration || ''}分钟`;
            el.innerHTML = `
                <div class="history-item-icon">${icon}</div>
                <div class="history-item-info">
                    <div class="history-item-title">${ScheduleView.escape(item.title)}</div>
                    <div class="history-item-time">${item.time}</div>
                </div>
                <div class="history-item-badge ${item.badge}">${badgeText}</div>
            `;
            list.appendChild(el);
        });
    }
};

// ===== 主题切换 =====
const Theme = {
    init() {
        const saved = Store.data.settings.theme || 'light';
        this.set(saved);
        document.getElementById('themeToggle').addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'light';
            this.set(current === 'light' ? 'dark' : 'light');
        });
    },

    set(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        Store.data.settings.theme = theme;
        Store.save();
    }
};

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
    Store.init();
    Theme.init();
    Nav.init();
    ScheduleView.init();
    AlarmView.init();
    AlarmTrigger.init();
    FocusView.init();
    RestrictView.init();
    RecommendView.init();
    ForceLock.init();

    // 同步强制锁屏设置
    ForceLock.enabled = Store.data.settings.forceLockScreen !== false;

    // 显示当前日期
    const now = new Date();
    const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    document.getElementById('currentDate').textContent =
        `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 ${days[now.getDay()]}`;

    ScheduleView.render();
    AlarmView.render();
    RestrictView.render();
    FocusView.refreshTaskSelect();

    // 移除启动画面
    setTimeout(() => {
        const splash = document.getElementById('splashScreen');
        if (splash) splash.remove();
    }, 1500);

    // 每秒更新倒计时和当前状态
    setInterval(() => {
        if (Nav.currentTab === 'schedule') {
            const tasks = Store.getTodayTasks();
            ScheduleView.updateNextTask(tasks);
            // 更新进行中状态（每分钟检查）
            if (new Date().getSeconds() === 0) {
                ScheduleView.render();
            }
        }
    }, 1000);

    // 防止页面关闭时丢失数据
    window.addEventListener('beforeunload', () => {
        Store.save();
    });

    // 初始化音频上下文（需要用户交互后才能生效）
    document.addEventListener('click', () => {
        if (!AudioMgr.ctx) AudioMgr.init();
        if (AudioMgr.ctx && AudioMgr.ctx.state === 'suspended') {
            AudioMgr.ctx.resume();
        }
    }, { once: true });

    // PWA 初始化
    PWA.init();

    // 处理 URL 参数（快捷方式）
    PWA.handleURLParams();

    console.log('FocusGuard 已启动 ✅');
});

// ===== PWA 支持 =====
const PWA = {
    deferredPrompt: null,
    wakeLock: null,

    init() {
        // 注册 Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('SW registered:', reg.scope))
                .catch(err => console.warn('SW registration failed:', err));
        }

        // 监听安装提示
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallBanner();
        });

        // 监听安装完成
        window.addEventListener('appinstalled', () => {
            this.hideInstallBanner();
            toast('已安装到主屏幕！', 'success');
        });

        // 检测是否已安装
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
            console.log('Running as installed PWA');
        }
    },

    showInstallBanner() {
        if (document.getElementById('installBanner')) return;
        const banner = document.createElement('div');
        banner.id = 'installBanner';
        banner.className = 'install-banner';
        banner.innerHTML = `
            <div class="install-banner-content">
                <div class="install-banner-icon">📱</div>
                <div class="install-banner-text">
                    <strong>安装到主屏幕</strong>
                    <span>像 App 一样使用，支持离线</span>
                </div>
            </div>
            <div class="install-banner-actions">
                <button class="install-banner-dismiss" id="installDismiss">稍后</button>
                <button class="btn btn-primary btn-sm" id="installBtn">安装</button>
            </div>
        `;
        document.body.appendChild(banner);

        document.getElementById('installBtn').addEventListener('click', () => this.promptInstall());
        document.getElementById('installDismiss').addEventListener('click', () => this.hideInstallBanner());
    },

    hideInstallBanner() {
        const banner = document.getElementById('installBanner');
        if (banner) banner.remove();
    },

    async promptInstall() {
        if (!this.deferredPrompt) {
            toast('请使用浏览器菜单"添加到主屏幕"', 'warning');
            return;
        }
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            this.hideInstallBanner();
        }
        this.deferredPrompt = null;
    },

    handleURLParams() {
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab');
        const action = params.get('action');
        if (tab) {
            setTimeout(() => Nav.switchTab(tab), 100);
        }
        if (action === 'add') {
            setTimeout(() => ScheduleView.openModal(), 200);
        }
    },

    // 屏幕常亮（专注模式时使用）
    async requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                this.wakeLock = await navigator.wakeLock.request('screen');
                console.log('Wake Lock activated');
            }
        } catch(err) {
            console.warn('Wake Lock failed:', err);
        }
    },

    releaseWakeLock() {
        if (this.wakeLock) {
            this.wakeLock.release();
            this.wakeLock = null;
            console.log('Wake Lock released');
        }
    }
};

// 页面可见性变化时重新请求 Wake Lock
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && FocusView.isRunning) {
        PWA.requestWakeLock();
    }
});
