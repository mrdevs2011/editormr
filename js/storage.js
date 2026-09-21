    // ===================== STORAGE (Supabase: Database + Storage) =====================
    // Ikkita joy:
    //   projects jadvali    — yengil meta (clip'lar, musiqa, zoom, playhead, thumbnail, fayl nomlari)
    //   project-media bucket — asl media fayllar (video / rasm / audio), yo'l: <user_id>/<projectId>/<fileId>
    // Har bir foydalanuvchi faqat o'z qatorlari/fayllarini ko'radi (RLS, quyida SETUP.sql'da).

    const BUCKET = 'project-media';

    function sbClient() {
      if (!window.Auth || !window.Auth.client) throw new Error('Supabase ulanmagan');
      return window.Auth.client;
    }

    // Sahifa yuklanganda Auth.requireSession() hali tugamagan bo'lishi mumkin —
    // shu yerda kerak bo'lganda o'zi kutib, sessiyani keshlaydi.
    async function ensureSession() {
      if (window.Auth && window.Auth.session) return window.Auth.session;
      const s = await window.Auth.getSession();
      if (!s) throw new Error('Kirish kerak — sessiya topilmadi');
      window.Auth.session = s;
      return s;
    }

    async function currentUserId() {
      const s = await ensureSession();
      return s.user.id;
    }

    function mediaPath(uid, projectId, fileId) {
      return `${uid}/${projectId}/${fileId}`;
    }

    const LOCK_KEY_SESSION = '__lockSession';
    const LOCK_KEY_UNTIL = '__lockUntil';
    const LOCK_TTL_MS = 120000;
    // Eski fallback: canvas nisbati file_names ichida saqlanardi (Faza 0).
    // 002 migratsiyadan keyin alohida `canvas` jsonb ustuni ishlatiladi;
    // eski kalit faqat eski qatorlarni o'qish uchun qoladi.
    const CANVAS_KEY = '__canvas';

    function editorSessionId() {
      try {
        let id = sessionStorage.getItem('emr-edit-session');
        if (!id) {
          id = 's' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
          sessionStorage.setItem('emr-edit-session', id);
        }
        return id;
      } catch (_) {
        if (!editorSessionId._mem) {
          editorSessionId._mem = 's' + Math.random().toString(36).slice(2, 10);
        }
        return editorSessionId._mem;
      }
    }

    function isReservedFileKey(id) {
      return !id || String(id).startsWith('__');
    }

    function lockInfoFromFileNames(fn) {
      fn = fn || {};
      return {
        session: fn[LOCK_KEY_SESSION] || null,
        until: Number(fn[LOCK_KEY_UNTIL] || 0) || 0,
      };
    }

    function isLockHeldByOther(fn, now) {
      const info = lockInfoFromFileNames(fn);
      if (!info.session || info.until <= (now || Date.now())) return false;
      return info.session !== editorSessionId();
    }

    function rowToMeta(row) {
      const fn = row.file_names || {};
      const lock = lockInfoFromFileNames(fn);
      const now = Date.now();
      return {
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        thumb: row.thumb,
        duration: row.duration,
        clipCount: row.clip_count,
        clips: row.clips || [],
        music: row.music || null,
        // B1 tuzatish: matn overlay'lar endi alohida ustunda saqlanadi/o'qiladi (migrations/001_add_text_clips.sql)
        textClips: Array.isArray(row.text_clips) ? row.text_clips : [],
        // Faza 4: audio_clips + ducking (migrations/004)
        audioClips: Array.isArray(row.audio_clips) ? row.audio_clips : [],
        ducking: (row.ducking && typeof row.ducking === 'object') ? row.ducking : null,
        // Faza 5: subtitles (migrations/005)
        subtitles: (row.subtitles && typeof row.subtitles === 'object') ? row.subtitles : null,
        // Faza 3: extras (migrations/003)
        extras: (row.extras && typeof row.extras === 'object') ? row.extras : {},
        markers: (row.extras && Array.isArray(row.extras.markers)) ? row.extras.markers : [],
        inPoint: (row.extras && row.extras.inPoint != null) ? row.extras.inPoint : null,
        outPoint: (row.extras && row.extras.outPoint != null) ? row.extras.outPoint : null,
        currentTime: row.current_time_sec || 0,
        pps: row.pps,
        // Faza 2A-1: canvas ustuni (jsonb {w,h,fps} yoki null). Eski qatorlarda
        // faqat file_names.__canvas (string ratio) bo'lishi mumkin — uni ham o'qiymiz.
        canvas: (row.canvas !== undefined && row.canvas !== null)
          ? row.canvas
          : (fn[CANVAS_KEY] || null),
        schemaVersion: (row.schema_version != null) ? Number(row.schema_version) : undefined,
        locked: !!(lock.session && lock.until > now && lock.session !== editorSessionId()),
        lockUntil: lock.until,
      };
    }

    async function dbListProjects() {
      const uid = await currentUserId();
      const { data, error } = await sbClient()
        .from('projects').select('*').eq('user_id', uid);
      if (error) throw error;
      return data.map(rowToMeta);
    }

    function isSaveConflictError(err) {
      return !!(err && err.code === 'SAVE_CONFLICT');
    }

    async function dbPeekUpdatedAt(id) {
      const uid = await currentUserId();
      const { data, error } = await sbClient()
        .from('projects').select('updated_at').eq('id', id).eq('user_id', uid).maybeSingle();
      if (error) throw error;
      return data ? data.updated_at : null;
    }

    async function dbGetProject(id) {
      const uid = await currentUserId();
      const { data, error } = await sbClient()
        .from('projects').select('*').eq('id', id).eq('user_id', uid).maybeSingle();
      if (error) throw error;
      return data ? rowToMeta(data) : null;
    }

    async function dbGetFiles(projectId) {
      const uid = await currentUserId();
      const { data: row, error } = await sbClient()
        .from('projects').select('file_names').eq('id', projectId).eq('user_id', uid).maybeSingle();
      if (error) throw error;
      if (!row) return [];
      const fileNames = (row && row.file_names) || {};
      const out = [];
      for (const [id, name] of Object.entries(fileNames)) {
        if (isReservedFileKey(id)) continue;
        const path = mediaPath(uid, projectId, id);
        const { data: blob, error: dlErr } = await sbClient().storage.from(BUCKET).download(path);
        if (dlErr) { console.warn('[storage] media topilmadi:', path, dlErr.message); continue; }
        out.push({ id, projectId, name, type: blob.type, blob });
      }
      return out;
    }

    // Meta + yangi fayllar + keraksiz fayllar — avval yuklaymiz, keyin meta yozamiz,
    // oxirida ortiqchasini o'chiramiz (shunday tartibda hech qachon "meta bor-u fayl yo'q" holat bo'lmaydi)
    async function dbSaveProject(meta, newFiles, removedFileIds, opts) {
      const uid = await currentUserId();
      opts = opts || {};
      const expected = opts.expectedUpdatedAt;

      // Optimistic lock: boshqa sessiya allaqachon yangi versiya yozgan bo'lsa — to'xtatamiz
      if (expected != null) {
        const remote = await dbPeekUpdatedAt(meta.id);
        if (remote != null && Number(remote) !== Number(expected)) {
          const err = new Error('SAVE_CONFLICT');
          err.code = 'SAVE_CONFLICT';
          err.remoteUpdatedAt = remote;
          throw err;
        }
      }

      for (const f of newFiles) {
        const path = mediaPath(uid, meta.id, f.id);
        const { error } = await sbClient().storage.from(BUCKET)
          .upload(path, f.blob, { contentType: f.type || 'application/octet-stream', upsert: true });
        if (error) throw error;
      }

      const { data: existing } = await sbClient()
        .from('projects').select('file_names, updated_at').eq('id', meta.id).eq('user_id', uid).maybeSingle();
      if (expected != null && existing && Number(existing.updated_at) !== Number(expected)) {
        const err = new Error('SAVE_CONFLICT');
        err.code = 'SAVE_CONFLICT';
        err.remoteUpdatedAt = existing.updated_at;
        throw err;
      }
      const fileNames = { ...((existing && existing.file_names) || {}) };
      for (const f of newFiles) fileNames[f.id] = f.name;
      for (const id of removedFileIds) {
        if (!isReservedFileKey(id)) delete fileNames[id];
      }
      // Eski __canvas kalitini tozalaymiz — endi alohida ustun
      if (Object.prototype.hasOwnProperty.call(fileNames, CANVAS_KEY)) {
        delete fileNames[CANVAS_KEY];
      }
      // Ochiq sessiya lockini saqlab qolamiz
      if (fileNames[LOCK_KEY_SESSION] === editorSessionId()) {
        fileNames[LOCK_KEY_UNTIL] = Date.now() + LOCK_TTL_MS;
      }

      const row = {
        id: meta.id,
        user_id: uid,
        name: meta.name,
        created_at: meta.createdAt,
        updated_at: meta.updatedAt,
        thumb: meta.thumb,
        duration: meta.duration,
        clip_count: meta.clipCount,
        clips: meta.clips,
        music: meta.music,
        // B1 tuzatish: matn overlay'larni ham DB'ga yozamiz (ilgari yo'qolib ketardi)
        text_clips: meta.textClips || [],
        // Faza 4: audio_clips + ducking (migrations/004)
        audio_clips: Array.isArray(meta.audioClips) ? meta.audioClips : [],
        ducking: meta.ducking && typeof meta.ducking === 'object' ? meta.ducking : { enabled: false, amountDb: -12, attackMs: 150, releaseMs: 400, includeVideoAudio: true },
        // Faza 5: subtitles (migrations/005)
        subtitles: meta.subtitles && typeof meta.subtitles === 'object' ? meta.subtitles : null,
        // Faza 3: extras (migrations/003)
        extras: meta.extras && typeof meta.extras === 'object' ? meta.extras : {},
        current_time_sec: meta.currentTime,
        pps: meta.pps,
        file_names: fileNames,
        // Faza 2A-1: canvas + schema_version (migrations/002). Ustunlar yo'q bo'lsa
        // saqlash xato beradi — avval SQL'ni Supabase'da ishga tushirish SHART.
        canvas: meta.canvas != null ? meta.canvas : null,
        schema_version: meta.schemaVersion != null ? meta.schemaVersion : 1,
      };

      if (!existing) {
        const { error: insErr } = await sbClient().from('projects').insert(row);
        if (insErr) throw insErr;
      } else if (expected != null) {
        const { data: updated, error: upErr } = await sbClient()
          .from('projects')
          .update(row)
          .eq('id', meta.id)
          .eq('user_id', uid)
          .eq('updated_at', expected)
          .select('id');
        if (upErr) throw upErr;
        if (!updated || !updated.length) {
          const err = new Error('SAVE_CONFLICT');
          err.code = 'SAVE_CONFLICT';
          throw err;
        }
      } else {
        const { error: upErr } = await sbClient().from('projects').upsert(row);
        if (upErr) throw upErr;
      }

      if (removedFileIds.length) {
        const paths = removedFileIds.map(id => mediaPath(uid, meta.id, id));
        await sbClient().storage.from(BUCKET).remove(paths);
      }
    }

    function isProjectLockedError(err) {
      return !!(err && err.code === 'PROJECT_LOCKED');
    }

    async function dbReadFileNames(projectId) {
      const uid = await currentUserId();
      const { data, error } = await sbClient()
        .from('projects').select('file_names').eq('id', projectId).eq('user_id', uid).maybeSingle();
      if (error) throw error;
      return { uid, row: data, fileNames: { ...((data && data.file_names) || {}) } };
    }

    async function dbWriteFileNames(projectId, fileNames) {
      const uid = await currentUserId();
      const { error } = await sbClient()
        .from('projects')
        .update({ file_names: fileNames })
        .eq('id', projectId)
        .eq('user_id', uid);
      if (error) throw error;
    }

    async function dbAcquireProjectLock(projectId, opts) {
      if (!projectId) return true;
      const steal = !!(opts && opts.steal);
      const now = Date.now();
      const session = editorSessionId();
      const { fileNames } = await dbReadFileNames(projectId);
      if (!steal && isLockHeldByOther(fileNames, now)) {
        const err = new Error('PROJECT_LOCKED');
        err.code = 'PROJECT_LOCKED';
        err.lockUntil = lockInfoFromFileNames(fileNames).until;
        throw err;
      }
      fileNames[LOCK_KEY_SESSION] = session;
      fileNames[LOCK_KEY_UNTIL] = now + LOCK_TTL_MS;
      await dbWriteFileNames(projectId, fileNames);
      if (!steal) {
        const check = await dbReadFileNames(projectId);
        if (isLockHeldByOther(check.fileNames, Date.now())) {
          const err = new Error('PROJECT_LOCKED');
          err.code = 'PROJECT_LOCKED';
          throw err;
        }
      }
      return true;
    }

    async function dbOwnsProjectLock(projectId) {
      if (!projectId) return false;
      const { fileNames } = await dbReadFileNames(projectId);
      const info = lockInfoFromFileNames(fileNames);
      if (!info.session || info.until <= Date.now()) return true;
      return info.session === editorSessionId();
    }

    async function dbHeartbeatProjectLock(projectId) {
      if (!projectId) return true;
      const session = editorSessionId();
      const { fileNames } = await dbReadFileNames(projectId);
      if (fileNames[LOCK_KEY_SESSION] && fileNames[LOCK_KEY_SESSION] !== session) return false;
      fileNames[LOCK_KEY_SESSION] = session;
      fileNames[LOCK_KEY_UNTIL] = Date.now() + LOCK_TTL_MS;
      await dbWriteFileNames(projectId, fileNames);
      return true;
    }

    async function dbReleaseProjectLock(projectId) {
      if (!projectId) return;
      try {
        const session = editorSessionId();
        const { fileNames } = await dbReadFileNames(projectId);
        if (fileNames[LOCK_KEY_SESSION] && fileNames[LOCK_KEY_SESSION] !== session) return;
        delete fileNames[LOCK_KEY_SESSION];
        delete fileNames[LOCK_KEY_UNTIL];
        await dbWriteFileNames(projectId, fileNames);
      } catch (_) {}
    }

    async function dbRenameProject(id, name) {
      const uid = await currentUserId();
      const { error } = await sbClient()
        .from('projects').update({ name, updated_at: Date.now() }).eq('id', id).eq('user_id', uid);
      if (error) throw error;
    }

    async function dbDeleteProject(id) {
      const uid = await currentUserId();
      const { data: row } = await sbClient()
        .from('projects').select('file_names').eq('id', id).eq('user_id', uid).maybeSingle();
      const fileNames = (row && row.file_names) || {};
      const paths = Object.keys(fileNames).map(fid => mediaPath(uid, id, fid));
      if (paths.length) await sbClient().storage.from(BUCKET).remove(paths);
      const { error } = await sbClient().from('projects').delete().eq('id', id).eq('user_id', uid);
      if (error) throw error;
    }

    // File obyekti -> barqaror id (bir xil File = bir xil id, split qilingan clip'lar ham)
    const fileIds = new WeakMap();
    function fileIdOf(file) {
      let id = fileIds.get(file);
      if (!id) {
        id = 'f' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        fileIds.set(file, id);
      }
      return id;
    }
    function rememberFileId(file, id) { fileIds.set(file, id); }

    function makeProjectId() {
      return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
