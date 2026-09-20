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

    function rowToMeta(row) {
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
        currentTime: row.current_time_sec || 0,
        pps: row.pps,
      };
    }

    async function dbListProjects() {
      const uid = await currentUserId();
      const { data, error } = await sbClient()
        .from('projects').select('*').eq('user_id', uid);
      if (error) throw error;
      return data.map(rowToMeta);
    }

    async function dbGetProject(id) {
      await currentUserId();
      const { data, error } = await sbClient()
        .from('projects').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? rowToMeta(data) : null;
    }

    async function dbGetFiles(projectId) {
      const uid = await currentUserId();
      const { data: row, error } = await sbClient()
        .from('projects').select('file_names').eq('id', projectId).maybeSingle();
      if (error) throw error;
      const fileNames = (row && row.file_names) || {};
      const out = [];
      for (const [id, name] of Object.entries(fileNames)) {
        const path = mediaPath(uid, projectId, id);
        const { data: blob, error: dlErr } = await sbClient().storage.from(BUCKET).download(path);
        if (dlErr) { console.warn('[storage] media topilmadi:', path, dlErr.message); continue; }
        out.push({ id, projectId, name, type: blob.type, blob });
      }
      return out;
    }

    // Meta + yangi fayllar + keraksiz fayllar — avval yuklaymiz, keyin meta yozamiz,
    // oxirida ortiqchasini o'chiramiz (shunday tartibda hech qachon "meta bor-u fayl yo'q" holat bo'lmaydi)
    async function dbSaveProject(meta, newFiles, removedFileIds) {
      const uid = await currentUserId();

      for (const f of newFiles) {
        const path = mediaPath(uid, meta.id, f.id);
        const { error } = await sbClient().storage.from(BUCKET)
          .upload(path, f.blob, { contentType: f.type || 'application/octet-stream', upsert: true });
        if (error) throw error;
      }

      const { data: existing } = await sbClient()
        .from('projects').select('file_names').eq('id', meta.id).maybeSingle();
      const fileNames = { ...((existing && existing.file_names) || {}) };
      for (const f of newFiles) fileNames[f.id] = f.name;
      for (const id of removedFileIds) delete fileNames[id];

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
        current_time_sec: meta.currentTime,
        pps: meta.pps,
        file_names: fileNames,
      };
      const { error: upErr } = await sbClient().from('projects').upsert(row);
      if (upErr) throw upErr;

      if (removedFileIds.length) {
        const paths = removedFileIds.map(id => mediaPath(uid, meta.id, id));
        await sbClient().storage.from(BUCKET).remove(paths);
      }
    }

    async function dbRenameProject(id, name) {
      const { error } = await sbClient()
        .from('projects').update({ name, updated_at: Date.now() }).eq('id', id);
      if (error) throw error;
    }

    async function dbDeleteProject(id) {
      const uid = await currentUserId();
      const { data: row } = await sbClient()
        .from('projects').select('file_names').eq('id', id).maybeSingle();
      const fileNames = (row && row.file_names) || {};
      const paths = Object.keys(fileNames).map(fid => mediaPath(uid, id, fid));
      if (paths.length) await sbClient().storage.from(BUCKET).remove(paths);
      const { error } = await sbClient().from('projects').delete().eq('id', id);
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
