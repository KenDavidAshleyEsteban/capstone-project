(() => {
  'use strict';
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const robot = () => `<svg viewBox="0 0 120 180" aria-hidden="true" focusable="false"><g class="guide-mech-outline"><path d="M43 18 30 7M77 18 90 7M45 14H75L80 35 69 44H51L40 35Z"/><path d="M47 28H73M60 15V40M36 48H84L89 88 76 102H44L31 88Z"/><path d="M39 55 60 67 81 55M47 85H73M46 103H74L81 116 69 128H51L39 116Z"/><path d="M30 48H17L10 80 18 88 29 79ZM90 48H103L110 80 102 88 91 79ZM15 90H29V119H12ZM91 90H105L108 119H91Z"/><path d="M44 122H57V153L49 171H28L32 157ZM63 122H76L88 157 92 171H71L63 153ZM32 157H53M67 157H88"/></g><path class="guide-mech-accent" d="M49 28H71V33H49ZM45 55 58 63 58 73 43 66ZM75 55 62 63 62 73 77 66Z"/></svg>`;
  const profiles = {
    EG: ['A simple starting point', 'Start with the manual and check whether the kit uses touch gates or needs nippers.', 'Fewer assembly steps', 'Learn how parts fit'],
    HG: ['A versatile first build', 'Practice clipping, cleanup, and assembly before adding optional finishing details.', 'A manageable build', 'Practice clean assembly'],
    RG: ['Small scale, close attention', 'Plan space for tiny pieces. Similar scale to many HG kits, with a different building experience.', 'Small detailed parts', 'Work slowly and precisely'],
    MG: ['More room for the details', 'Allow extra display space and follow each frame and armor assembly in sequence.', 'Usually a larger model', 'Plan a longer build'],
    SD: ['A stylized desk companion', 'Look at the specific series: SD designs and construction vary, and not all are simple.', 'Stylized proportions', 'Choose the design you enjoy'],
    PG: ['A substantial display project', 'Check the manual, workspace, and parts organization before starting a longer project.', 'Usually a larger model', 'Build in organized sessions']
  };

  function mount({ container, grades }) {
    if (!container) return;
    container.innerHTML = `
      <section class="guide-infographic" aria-labelledby="scaleGraphicTitle">
        <div class="guide-infographic-heading"><p class="kicker">Size at a glance</p><h2 id="scaleGraphicTitle">Same mobile suit. Different scale.</h2><p>A smaller scale denominator means a larger model. This diagram uses an 18 m fictional mobile suit as a reference.</p></div>
        <div class="guide-scale-chart" role="img" aria-label="For an 18 meter mobile suit: 1 to 144 is 12.5 centimeters, 1 to 100 is 18 centimeters, and 1 to 60 is 30 centimeters. Actual kit heights vary by design.">
          ${[{ scale: '1/144', height: '12.5 cm', grades: 'EG · HG · RG', ratio: 41.6667 }, { scale: '1/100', height: '18 cm', grades: 'MG', ratio: 60 }, { scale: '1/60', height: '30 cm', grades: 'PG', ratio: 100 }].map((item) => `<div class="guide-scale-column"><div class="guide-scale-figure"><div style="height:${item.ratio}%">${robot()}</div></div><strong>${item.scale}</strong><span>${item.height}</span><small>${item.grades}</small></div>`).join('')}
        </div>
        <p class="guide-infographic-footnote">Illustrative heights, not a size guarantee. Grade and scale are different: check each box for its scale; SD uses stylized proportions. <a href="https://satellite.bandai-hobby.net/characters/gundam_list.php" target="_blank" rel="noopener noreferrer">BANDAI grade overview ↗</a></p>
      </section>

      <section class="guide-infographic guide-grade-explorer" aria-labelledby="gradeExplorerTitle">
        <div class="guide-infographic-heading"><p class="kicker">Find your build</p><h2 id="gradeExplorerTitle">Explore the grades</h2><p>Select a grade to compare its typical scale and building focus. Construction varies by kit and series.</p></div>
        <div class="guide-grade-choices" role="group" aria-label="Select a kit grade">${grades.map((grade) => `<button class="guide-grade-choice" type="button" data-grade="${escape(grade.code)}" aria-pressed="${grade.code === 'HG'}" aria-controls="guideGradeDetail">${escape(grade.code)}<small>${escape(grade.name)}</small></button>`).join('')}</div>
        <div id="guideGradeDetail" class="guide-grade-detail" aria-live="polite"></div>
      </section>

      <section class="guide-infographic" aria-labelledby="cleanupGraphicTitle">
        <div class="guide-infographic-heading"><p class="kicker">Clean parts, better fits</p><h2 id="cleanupGraphicTitle">From runner to ready</h2><p>Find the numbered part in the manual, then work through clipping and cleanup.</p></div>
        <ol class="guide-cut-diagram">
          <li><svg viewBox="0 0 200 150" role="img" aria-label="Leave a small piece of gate attached when cutting the part from the runner"><path class="guide-runner-line" d="M10 20H190M100 20V64"/><rect class="guide-plastic-part" x="57" y="64" width="86" height="65" rx="8"/><path class="guide-cut-line" d="M77 43H123"/><path class="guide-tool-line" d="M67 12 100 43 133 12"/></svg><h3><span>01</span> Leave a little gate</h3><p>Cut away from the part first, leaving a small amount of plastic attached.</p></li>
          <li><svg viewBox="0 0 200 150" role="img" aria-label="Carefully trim the remaining gate close to the part"><path class="guide-runner-line" d="M100 40V64"/><rect class="guide-plastic-part" x="57" y="64" width="86" height="65" rx="8"/><path class="guide-cut-line" d="M77 59H123"/><path class="guide-tool-line" d="M70 25 100 59 130 25"/></svg><h3><span>02</span> Trim carefully</h3><p>Support the part and trim the remaining gate in small, controlled cuts.</p></li>
          <li><svg viewBox="0 0 200 150" role="img" aria-label="Smooth the remaining nub with a sanding stick before assembly"><rect class="guide-plastic-part" x="57" y="64" width="86" height="65" rx="8"/><path class="guide-sanding-stick" d="M53 37H147V53H53Z"/><path class="guide-tool-line" d="M64 22H135M131 17 137 22 131 27M69 17 63 22 69 27"/><path class="guide-clean-edge" d="M68 64H132"/></svg><h3><span>03</span> Smooth and check</h3><p>Gently smooth any nub, then test the fit. Avoid removing more material than needed.</p></li>
        </ol>
        <p class="guide-infographic-footnote"><span class="guide-diagram-key">Orange: plastic gate</span><span class="guide-diagram-key cut">Red dashes: cut location</span>Follow kit-specific instructions for touch gates and undergates. <a href="https://satellite.bandai-hobby.net/For_Oversea_Customer/beginnersguide_tips.html" target="_blank" rel="noopener noreferrer">BANDAI building tips ↗</a></p>
      </section>`;
    const detail = container.querySelector('#guideGradeDetail');
    const select = (code) => {
      const grade = grades.find((item) => item.code === code);
      if (!grade) return;
      const profile = profiles[code];
      container.querySelectorAll('.guide-grade-choice').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.grade === code)));
      detail.innerHTML = `<div class="guide-explorer-emblem" aria-hidden="true">${escape(code)}${robot()}</div><div><span class="pill yellow">${escape(grade.scale)}</span><h3>${escape(profile[0])}</h3><p>${escape(profile[1])}</p><dl class="guide-explorer-facts"><div><dt>What to expect</dt><dd>${escape(profile[2])}</dd></div><div><dt>Build focus</dt><dd>${escape(profile[3])}</dd></div></dl><a href="discover.html" class="ghost-btn">Browse local kits</a></div>`;
    };
    container.addEventListener('click', (event) => {
      const button = event.target.closest('.guide-grade-choice');
      if (button) select(button.dataset.grade);
    });
    select('HG');
  }
  window.GUNPLA_GUIDE_INFOGRAPHICS = { mount };
})();
