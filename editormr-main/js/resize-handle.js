    // ===== Timeline height resize (drag top edge) =====
    let isResizingTimeline = false;
    let resizeStartY = 0;
    let resizeStartHeight = 0;

    timelineResizeHandle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isResizingTimeline = true;
      resizeStartY = e.clientY;
      resizeStartHeight = timelineSection.offsetHeight;
      timelineResizeHandle.classList.add('dragging');
      document.body.style.cursor = 'ns-resize';
      document.addEventListener('pointermove', onTimelineResize);
      document.addEventListener('pointerup', endTimelineResize);
    });

    function onTimelineResize(e) {
      if (!isResizingTimeline) return;
      // Dragging up (smaller clientY) → taller timeline
      const dy = resizeStartY - e.clientY;
      let newH = resizeStartHeight + dy;
      // Min: 1%, Max: 100% (1% step'da)
      const minH = Math.floor(window.innerHeight * 0.01);
      const maxH = window.innerHeight;
      newH = Math.max(minH, Math.min(maxH, newH));
      // 1% step'da round qilish
      const percentH = Math.round((newH / window.innerHeight) * 100);
      const finalH = Math.floor((percentH / 100) * window.innerHeight);
      timelineSection.style.height = finalH + 'px';
      // 38% dan kichik bo'lsa vaqt raqamlarini yashirish (siqilib ketmasin)
      timelineSection.classList.toggle('compressed', percentH < 38);
    }

    function endTimelineResize() {
      isResizingTimeline = false;
      timelineResizeHandle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.removeEventListener('pointermove', onTimelineResize);
      document.removeEventListener('pointerup', endTimelineResize);
      updateTimelineLayout();
    }

    console.log('EMR ready');
