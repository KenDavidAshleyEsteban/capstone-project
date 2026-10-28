(() => {
  'use strict';
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const profiles = {
    EG: ['A simple starting point', 'Start with the manual and check whether the kit uses touch gates or needs nippers.', 'Fewer assembly steps', 'Learn how parts fit'],
    HG: ['A versatile first build', 'Practice clipping, cleanup, and assembly before adding optional finishing details.', 'A manageable build', 'Practice clean assembly'],
    RG: ['Small scale, close attention', 'Plan space for tiny pieces. Similar scale to many HG kits, with a different building experience.', 'Small detailed parts', 'Work slowly and precisely'],
    MG: ['More room for the details', 'Allow extra display space and follow each frame and armor assembly in sequence.', 'Usually a larger model', 'Plan a longer build'],
    SD: ['A stylized desk companion', 'Look at the specific series: SD designs and construction vary, and not all are simple.', 'Stylized proportions', 'Choose the design you enjoy'],
    PG: ['A substantial display project', 'Check the manual, workspace, and parts organization before starting a longer project.', 'Usually a larger model', 'Build in organized sessions']
  };
  const gradePhotos = {
    EG: 'images/EntryGradenb1.png',
    HG: 'images/HighGradenb1.png',
    RG: 'images/RealGradenb1.png',
    MG: 'images/MasterGradenb1.png',
    SD: 'images/Deformednb1.png',
    PG: 'images/PerfectGradenb1.png'
  };
  // Crop transparent padding in the SVG viewBox; preserve the original photos.
  // EG/MG bodyPixels are approximate helmet-to-feet spans, excluding equipment.
  // Heights: Nu 22 m / 144, ZZ 19.86 m / 100; PGU Nu is 38 cm, 56 cm with funnels.
  const scaleExamples = [
    { grade: 'EG', name: 'Nu Gundam', scale: 144, bodyCm: 2200 / 144, bodyPixels: 1167, width: 1195, height: 1316, bounds: [69, 35, 1087, 1218] },
    { grade: 'MG', name: 'ZZ Gundam', scale: 100, bodyCm: 1986 / 100, bodyPixels: 1080, width: 1179, height: 1334, bounds: [136, 31, 962, 1285] },
    { grade: 'PGU', photoGrade: 'PG', name: 'Nu Gundam', scale: 60, bodyCm: 38, overallCm: 56, width: 1254, height: 1254, bounds: [273, 21, 793, 1226] }
  ];
  const photoHeightCm = (example) => example.overallCm ?? example.bodyCm * example.bounds[3] / example.bodyPixels;
  const tallestPhotoCm = Math.max(...scaleExamples.map(photoHeightCm));

  function mount({ container, grades }) {
    if (!container) return;
    container.innerHTML = `
      <section class="guide-infographic" aria-labelledby="scaleGraphicTitle">
        <div class="guide-infographic-heading"><p class="kicker">Size at a glance</p><h2 id="scaleGraphicTitle">Different grades. Different sizes.</h2><p>Compare the pictured Entry Grade, Master Grade, and Perfect Grade examples on one size scale. Orange markers show approximate body height; backpack weapons and funnels extend above it.</p></div>
        <div class="guide-scale-chart" role="img" aria-label="Approximate body heights on one shared baseline: Entry Grade Nu Gundam at 1 to 144, 15.3 centimeters; Master Grade ZZ Gundam at 1 to 100, 19.9 centimeters; Perfect Grade Unleashed Nu Gundam at 1 to 60, 38 centimeters, or about 56 centimeters including fin funnels. EG and MG heights are scale estimates. Photos illustrate relative sizes and poses can affect their apparent height.">
          ${scaleExamples.map((item) => `<div class="guide-scale-column"><div class="guide-scale-figure" style="--photo-height:${100 * photoHeightCm(item) / tallestPhotoCm}%;--body-height:${100 * item.bodyCm / tallestPhotoCm}%"><span class="guide-scale-body-marker" aria-hidden="true"></span><svg viewBox="${item.bounds.join(' ')}" width="${item.bounds[2]}" height="${item.bounds[3]}" aria-hidden="true" focusable="false"><image href="${escape(gradePhotos[item.photoGrade ?? item.grade])}" width="${item.width}" height="${item.height}"/></svg></div><strong>1/${item.scale}</strong><span>≈${item.bodyCm.toFixed(1)} cm body</span><small>${item.grade} · ${item.name}</small><small>${item.overallCm ? `≈${item.overallCm} cm with funnels` : 'Body height estimate'}</small></div>`).join('')}
        </div>
        <p class="guide-infographic-footnote">Approximate body heights: EG and MG use mobile-suit height divided by scale; PG uses published kit measurements. Poses and equipment affect total height. Sources: <a href="https://g-versus.ggame.jp/sp/ms_stage/ms/detail.php?ms=yh62smdj" target="_blank" rel="noopener noreferrer">Nu Gundam specs ↗</a>, <a href="https://manual.bandai-hobby.net/pdf/629.pdf" target="_blank" rel="noopener noreferrer">ZZ Gundam manual ↗</a>, <a href="https://www.bandaispirits.co.jp/products/search/detail.php?grp_id=5325&amp;prd_id=4573102691910000" target="_blank" rel="noopener noreferrer">PGU Nu Gundam dimensions ↗</a>.</p>
      </section>

      <section class="guide-infographic guide-grade-explorer" aria-labelledby="gradeExplorerTitle">
        <div class="guide-infographic-heading"><p class="kicker">Find your build</p><h2 id="gradeExplorerTitle">Explore the grades</h2><p>Select a grade to compare its typical scale and building focus. Construction varies by kit and series.</p></div>
        <div class="guide-grade-choices" role="group" aria-label="Select a kit grade">${grades.map((grade) => `<button class="guide-grade-choice" type="button" data-grade="${escape(grade.code)}" aria-pressed="${grade.code === 'HG'}" aria-controls="guideGradeDetail"><img class="guide-grade-photo" src="${escape(gradePhotos[grade.code])}" alt="" width="400" height="400" loading="lazy" decoding="async"><span>${escape(grade.code)}</span><small>${escape(grade.name)}</small></button>`).join('')}</div>
        <div id="guideGradeDetail" class="guide-grade-detail" aria-live="polite"></div>
      </section>

      <section class="guide-infographic" aria-labelledby="cleanupGraphicTitle">
        <div class="guide-infographic-heading"><p class="kicker">Clean parts, better fits</p><h2 id="cleanupGraphicTitle">From runner to ready</h2><p>Find the numbered part in the manual, then work through clipping and cleanup.</p></div>
        <ol class="guide-cut-diagram">
          <li><img src="images/LeaveALittleGate.png" alt="Nippers cutting the runner while leaving a small gate attached to the part" width="400" height="400" loading="lazy" decoding="async"><h3><span>01</span> Leave a little gate</h3><p>Cut away from the part first, leaving a small amount of plastic attached.</p></li>
          <li><img src="images/TrimCarefully.png" alt="Nippers trimming the remaining gate close to the part" width="400" height="400" loading="lazy" decoding="async"><h3><span>02</span> Trim carefully</h3><p>Support the part and trim the remaining gate in small, controlled cuts.</p></li>
          <li><img src="images/SmoothAndCheck.png" alt="Plastic part being checked after gate cleanup" width="400" height="400" loading="lazy" decoding="async"><h3><span>03</span> Smooth and check</h3><p>Gently smooth any nub, then test the fit. Avoid removing more material than needed.</p></li>
        </ol>
        <p class="guide-infographic-footnote">Follow kit-specific instructions for touch gates and undergates. <a href="https://satellite.bandai-hobby.net/For_Oversea_Customer/beginnersguide_tips.html" target="_blank" rel="noopener noreferrer">BANDAI building tips ↗</a></p>
      </section>`;
    const detail = container.querySelector('#guideGradeDetail');
    const select = (code) => {
      const grade = grades.find((item) => item.code === code);
      if (!grade) return;
      const profile = profiles[code];
      container.querySelectorAll('.guide-grade-choice').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.grade === code)));
      detail.innerHTML = `<div class="guide-explorer-emblem"><span aria-hidden="true">${escape(code)}</span><img class="guide-grade-photo" src="${escape(gradePhotos[code])}" alt="${escape(grade.name)} Gunpla model" width="400" height="400" loading="lazy" decoding="async"></div><div><span class="pill yellow">${escape(grade.scale)}</span><h3>${escape(profile[0])}</h3><p>${escape(profile[1])}</p><dl class="guide-explorer-facts"><div><dt>What to expect</dt><dd>${escape(profile[2])}</dd></div><div><dt>Build focus</dt><dd>${escape(profile[3])}</dd></div></dl><a href="discover.html" class="ghost-btn">Browse local kits</a></div>`;
    };
    container.addEventListener('click', (event) => {
      const button = event.target.closest('.guide-grade-choice');
      if (button) select(button.dataset.grade);
    });
    select('HG');
  }
  window.GUNPLA_GUIDE_INFOGRAPHICS = { mount };
})();
