<template>
  <div v-if="stats">
    <FilterBanner
      :has-filters="hasFilters"
      :active-filters="activeFilters"
      :filtered-count="filteredCount"
      :total-count="stats.global.totalDelegatesCount"
      @remove="removeFilter"
      @clear="clearFilters"
    />

    <!-- Le filtre par type de badge est desormais GLOBAL (toolbar StatisticsView). -->

    <!-- Filtre "Modalité de participation" — PAGE-LEVEL : pilote la decomposition
         "Total participants", les cartes geographiques ET l'engagement. -->
    <div class="page-mode-filter">
      <span class="mode-filter-label">{{ t("overview.participation.modeFilterLabel") }}</span>
      <button
        v-for="m in ['PHYSIQUE', 'LIVE', 'REPLAY']"
        :key="m"
        type="button"
        class="mode-pill"
        :class="{ on: isModeOn(m) }"
        @click="toggleMode(m)"
      >{{ modeLabel(m) }}</button>
    </div>

    <div class="kpi-grid kpi-overview">
      <div class="kpi-card blue">
        <div class="kpi-label">{{ t("overview.kpi.totalRegistered") }}</div>
        <div class="kpi-value">{{ fmt(registeredCount) }}</div>
        <div class="kpi-sub">{{ t("overview.kpi.registeredStatus") }}</div>
        <span v-if="deltaRegisteredKpi" class="formula-delta" :class="deltaRegisteredKpi.cls" :title="tipRegisteredKpi">{{ deltaRegisteredKpi.arrow }} {{ deltaRegisteredKpi.text }}</span>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">{{ t("overview.kpi.checkin") }}</div>
        <div class="kpi-value">{{ fmt(fs.global.checkedInCount) }}</div>
        <div class="kpi-sub">{{ t("overview.kpi.ofRegistered", { pct: pct(fs.global.checkedInCount, registeredCount) }) }}</div>
        <span v-if="deltaCheckinKpi" class="formula-delta" :class="deltaCheckinKpi.cls" :title="tipCheckinKpi">{{ deltaCheckinKpi.arrow }} {{ deltaCheckinKpi.text }}</span>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">{{ t("overview.kpi.onboarding") }}</div>
        <div class="kpi-value">{{ fmt(fs.global.onboardingCount) }}</div>
        <div class="kpi-sub">{{ t("overview.kpi.ofRegistered", { pct: pct(fs.global.onboardingCount, registeredCount) }) }}</div>
        <span v-if="deltaOnboardingKpi" class="formula-delta" :class="deltaOnboardingKpi.cls" :title="tipOnboardingKpi">{{ deltaOnboardingKpi.arrow }} {{ deltaOnboardingKpi.text }}</span>
      </div>
      <div v-if="props.mobileAppId" class="kpi-card purple">
        <div class="kpi-label">{{ t("overview.kpi.mobileApp") }}</div>
        <div class="kpi-value">{{ fmt(fs.global.mobileAppCount) }}</div>
        <div class="kpi-sub">{{ t("overview.kpi.ofRegisteredMobile", { pct: pct(fs.global.mobileAppCount, registeredCount) }) }}</div>
        <span v-if="deltaMobileKpi" class="formula-delta" :class="deltaMobileKpi.cls" :title="tipMobileKpi">{{ deltaMobileKpi.arrow }} {{ deltaMobileKpi.text }}</span>
      </div>
      <div class="kpi-card blue">
        <div class="kpi-label">{{ t("overview.kpi.live") }}</div>
        <div class="kpi-value">
          <span v-if="liveLoading" class="kpi-loading">...</span>
          <template v-else>{{ fmt(liveUniqueUsers) }}</template>
        </div>
        <div class="kpi-sub">
          <template v-if="!liveLoading">{{ t("overview.kpi.ofRegistered", { pct: pct(liveUniqueUsers, registeredCount) }) }}</template>
          <template v-else>{{ t("overview.kpi.loading") }}</template>
        </div>
        <span v-if="!liveLoading && deltaLiveKpi" class="formula-delta" :class="deltaLiveKpi.cls" :title="tipLiveKpi">{{ deltaLiveKpi.arrow }} {{ deltaLiveKpi.text }}</span>
      </div>
      <div class="kpi-card purple">
        <div class="kpi-label">{{ t("overview.kpi.replay") }}</div>
        <div class="kpi-value">
          <span v-if="replayLoading" class="kpi-loading">...</span>
          <template v-else>{{ fmt(replayUniqueUsers) }}</template>
        </div>
        <div class="kpi-sub">
          <template v-if="!replayLoading">{{ t("overview.kpi.ofRegistered", { pct: pct(replayUniqueUsers, registeredCount) }) }}</template>
          <template v-else>{{ t("overview.kpi.loading") }}</template>
        </div>
        <span v-if="!replayLoading && deltaReplayKpi" class="formula-delta" :class="deltaReplayKpi.cls" :title="tipReplayKpi">{{ deltaReplayKpi.arrow }} {{ deltaReplayKpi.text }}</span>
      </div>
    </div>

    <!-- Decomposition visuelle "Total participants" : un meme delegue compte
         1 fois meme s'il a vu live + replay sans venir. -->
    <div class="chart-card participation-card" v-if="!liveLoading && !replayLoading">
      <div class="chart-header">
        <h3>{{ t("overview.participation.decompositionTitle") }}</h3>
      </div>

      <!-- 3 grands modes de participation : Physique / Live distanciel /
           Replay distanciel. Chaque carte montre le total du mode + son detail. -->
      <div class="participation-modes">
        <div class="mode-card mode-physique">
          <div class="mode-head">
            <span class="mode-title">{{ t("overview.participation.physical") }}</span>
            <span class="mode-total">{{ fmt(physiqueCount) }}</span>
            <span class="mode-pct">{{ pct(physiqueCount, totalParticipants) }}</span>
            <span v-if="deltaPhysique" class="formula-delta" :class="deltaPhysique.cls" :title="tooltipPhysique">{{ deltaPhysique.arrow }} {{ deltaPhysique.text }}</span>
          </div>
          <div class="mode-subs">
            <div class="mode-sub"><span class="sub-swatch seg-checkin-only"></span><span class="sub-label">{{ t("overview.participation.onsiteOnly") }}</span><span class="sub-value">{{ fmt(checkedInOnlyCount) }}</span></div>
            <div class="mode-sub"><span class="sub-swatch seg-checkin-live"></span><span class="sub-label">{{ t("overview.participation.onsitePlusLive") }}</span><span class="sub-value">{{ fmt(checkedInLiveCount) }}</span></div>
            <div class="mode-sub"><span class="sub-swatch seg-checkin-livereplay"></span><span class="sub-label">{{ t("overview.participation.onsitePlusLiveReplay") }}</span><span class="sub-value">{{ fmt(checkedInLiveReplayCount) }}</span></div>
            <div class="mode-sub"><span class="sub-swatch seg-checkin-replay"></span><span class="sub-label">{{ t("overview.participation.onsitePlusReplay") }}</span><span class="sub-value">{{ fmt(checkedInReplayCount) }}</span></div>
          </div>
        </div>
        <span class="formula-op">+</span>
        <div class="mode-card mode-live">
          <div class="mode-head">
            <span class="mode-title">{{ t("overview.participation.liveRemote") }}</span>
            <span class="mode-total">{{ fmt(liveModeCount) }}</span>
            <span class="mode-pct">{{ pct(liveModeCount, totalParticipants) }}</span>
            <span v-if="deltaLiveMode" class="formula-delta" :class="deltaLiveMode.cls" :title="tooltipLiveMode">{{ deltaLiveMode.arrow }} {{ deltaLiveMode.text }}</span>
          </div>
          <div class="mode-subs">
            <div class="mode-sub"><span class="sub-swatch seg-live-only"></span><span class="sub-label">{{ t("overview.participation.liveOnly") }}</span><span class="sub-value">{{ fmt(liveOnlyRemoteCount) }}</span></div>
            <div class="mode-sub"><span class="sub-swatch seg-both"></span><span class="sub-label">{{ t("overview.participation.liveAndReplay") }}</span><span class="sub-value">{{ fmt(bothRemoteCount) }}</span></div>
          </div>
        </div>
        <span class="formula-op">+</span>
        <div class="mode-card mode-replay">
          <div class="mode-head">
            <span class="mode-title">{{ t("overview.participation.replayRemote") }}</span>
            <span class="mode-total">{{ fmt(replayModeCount) }}</span>
            <span class="mode-pct">{{ pct(replayModeCount, totalParticipants) }}</span>
            <span v-if="deltaReplayMode" class="formula-delta" :class="deltaReplayMode.cls" :title="tooltipReplayMode">{{ deltaReplayMode.arrow }} {{ deltaReplayMode.text }}</span>
          </div>
          <div class="mode-subs">
            <div class="mode-sub"><span class="sub-swatch seg-replay-only"></span><span class="sub-label">{{ t("overview.participation.replayOnly") }}</span><span class="sub-value">{{ fmt(replayOnlyRemoteCount) }}</span></div>
          </div>
        </div>
        <span class="formula-op">=</span>
        <div class="mode-card mode-total-card">
          <span class="mode-title">{{ t("overview.participation.total") }}</span>
          <span class="mode-total mode-total-big">{{ fmt(totalParticipants) }}</span>
          <span v-if="deltaTotal" class="formula-delta" :class="deltaTotal.cls" :title="tooltipTotal">{{ deltaTotal.arrow }} {{ deltaTotal.text }}</span>
        </div>
      </div>

      <!-- Barre A : 3 zones (modes) separees par un espace, chacune subdivisee
           en sous-segments. Largeur proportionnelle au total (barScaleA) dans
           une track ; le total absolu est affiche a droite. -->
      <div v-if="hasCompare && totalParticipants > 0" class="participation-bar-label">{{ eventName }}</div>
      <div class="participation-bar-row" v-if="totalParticipants > 0">
        <div class="participation-bar-track">
          <div class="participation-bar" :style="{ width: barScaleA + '%' }">
            <div
              v-for="zone in zonesA"
              :key="zone.key"
              v-show="zone.total > 0"
              class="bar-zone"
              :style="{ width: pctNum(zone.total, totalParticipants) + '%' }"
              :title="`${zone.label} : ${fmt(zone.total)} (${pct(zone.total, totalParticipants)})`"
            >
              <div
                v-for="seg in zone.segments"
                :key="seg.cls"
                class="bar-segment"
                :class="seg.cls"
                :style="{ width: pctNum(seg.count, zone.total) + '%' }"
                :title="`${seg.label} : ${fmt(seg.count)} (${pct(seg.count, totalParticipants)})`"
              >
                <span v-if="seg.count / totalParticipants > 0.05">{{ fmt(seg.count) }}</span>
              </div>
            </div>
          </div>
        </div>
        <span class="participation-bar-total">{{ fmt(totalParticipants) }}</span>
      </div>

      <!-- Barre B (event compare) : meme structure en zones. -->
      <template v-if="hasCompare">
        <div class="participation-bar-label">{{ compareEventName || t("overview.participation.comparedEvent") }}</div>
        <div class="participation-bar-row" v-if="totalParticipantsB > 0">
          <div class="participation-bar-track">
            <div class="participation-bar participation-bar-compare" :style="{ width: barScaleB + '%' }">
              <div
                v-for="zone in zonesB"
                :key="zone.key"
                v-show="zone.total > 0"
                class="bar-zone"
                :style="{ width: pctNum(zone.total, totalParticipantsB) + '%' }"
                :title="`${zone.label} : ${fmt(zone.total)} (${pct(zone.total, totalParticipantsB)})`"
              >
                <div
                  v-for="seg in zone.segments"
                  :key="seg.cls"
                  class="bar-segment"
                  :class="seg.cls"
                  :style="{ width: pctNum(seg.count, zone.total) + '%' }"
                  :title="`${seg.label} : ${fmt(seg.count)} (${pct(seg.count, totalParticipantsB)})`"
                >
                  <span v-if="seg.count / totalParticipantsB > 0.05">{{ fmt(seg.count) }}</span>
                </div>
              </div>
            </div>
          </div>
          <span class="participation-bar-total">{{ fmt(totalParticipantsB) }}</span>
        </div>
        <p v-else class="participation-note" style="margin-bottom: 12px">{{ t("overview.participation.noParticipant", { name: compareEventName || t("overview.participation.comparedEventLower") }) }}</p>
      </template>

      <!-- Legende groupee par grand mode -->
      <div class="participation-legend">
        <div class="legend-mode">
          <span class="legend-mode-head"><span class="swatch-pair"><i class="swatch seg-checkin-only"></i><i class="swatch seg-checkin-live"></i><i class="swatch seg-checkin-livereplay"></i><i class="swatch seg-checkin-replay"></i></span> {{ t("overview.participation.physical") }} <strong>· {{ pct(physiqueCount, totalParticipants) }}</strong></span>
          <span class="legend-mode-subs">{{ t("overview.participation.legendPhysicalSubs", { a: fmt(checkedInOnlyCount), b: fmt(checkedInLiveCount), c: fmt(checkedInLiveReplayCount), d: fmt(checkedInReplayCount) }) }}</span>
        </div>
        <div class="legend-mode">
          <span class="legend-mode-head"><span class="swatch-pair"><i class="swatch seg-live-only"></i><i class="swatch seg-both"></i></span> {{ t("overview.participation.liveRemote") }} <strong>· {{ pct(liveModeCount, totalParticipants) }}</strong></span>
          <span class="legend-mode-subs">{{ t("overview.participation.legendLiveSubs", { a: fmt(liveOnlyRemoteCount), b: fmt(bothRemoteCount) }) }}</span>
        </div>
        <div class="legend-mode">
          <span class="legend-mode-head"><span class="swatch-pair"><i class="swatch seg-replay-only"></i></span> {{ t("overview.participation.replayRemote") }} <strong>· {{ pct(replayModeCount, totalParticipants) }}</strong></span>
          <span class="legend-mode-subs">{{ t("overview.participation.legendReplaySubs", { a: fmt(replayOnlyRemoteCount) }) }}</span>
        </div>
      </div>

      <p class="participation-note">
        {{ t("overview.participation.note") }}
      </p>
    </div>

    <!-- Charts de synthese participation (comparatif si ?compareWith=) -->
    <div v-if="!liveLoading && !replayLoading">
      <div class="charts-row">
      <!-- Participants par jour, ventilé par modalité (suit le filtre de page). -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("overview.charts.participantsByDayTitle") }} <InfoTooltip :text="t('overview.charts.participantsByDayHint')" /></h3>
          <CsvButton
            filename="participants-par-jour"
            :headers="participantsByDayCsv.headers"
            :rows="participantsByDayCsv.rows"
          />
        </div>
        <div
          v-if="participantsByDayDatasets.length > 0 && participantsByDayLabels.length > 0"
          :style="{ position: 'relative', height: '300px' }"
        >
          <Bar :data="participantsByDayChart" :options="participantsByDayOptions" />
        </div>
        <p v-else class="empty-msg">{{ t("scans.empty.noTimestamped") }}</p>
      </div>

      <!-- Engagement : nb de sessions consultees par delegue, empile par
           modalite (presentiel / live / replay). Mode decoche => serie masquee. -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("overview.charts.engagementTitle") }} <InfoTooltip :text="t('overview.charts.engagementHint')" /></h3>
          <CsvButton
            filename="engagement-distribution"
            :label="t('overview.csv.distribution')"
            :headers="[t('overview.csv.bucket'), t('overview.csv.delegates')]"
            :rows="engagementCsvRows"
          />
          <CsvButton
            filename="engagement-detail-par-delegue"
            :label="t('overview.csv.perDelegate')"
            :primary="true"
            :headers="[t('overview.csv.delegateId'), t('overview.csv.name'), t('overview.csv.firstName'), t('overview.csv.email'), t('overview.csv.badgeType'), t('overview.csv.uniqueSessions'), t('overview.csv.bucket')]"
            :rows="engagementDetailRows"
          />
        </div>
        <StackedBarChart
          :labels="engagementChart.labels"
          :datasets="engagementChart.datasets"
          :show-total="true"
          :height="300"
          legend-position="bottom"
        />
      </div>
      </div>

      <div class="charts-row cols-3">
        <!-- Chart 1 : Participants vs Inscrits, groupe par event -->
        <div class="chart-card">
          <div class="chart-header">
            <h3>{{ t("overview.charts.participantsVsRegistered") }} <InfoTooltip :text="t('overview.charts.participantsVsRegisteredHint')" /></h3>
            <CsvButton
              filename="participants-vs-inscrits"
              :headers="[t('overview.csv.event'), t('overview.csv.registrations'), t('overview.csv.participants')]"
              :rows="hasCompare
                ? [[eventName, registeredCount, totalParticipants], [compareEventName, registeredCountB, totalParticipantsB]]
                : [[eventName, registeredCount, totalParticipants]]"
            />
          </div>
          <div :style="{ position: 'relative', height: '300px' }">
            <Bar :data="participantsVsRegisteredData" :options="groupedBarOptions" />
          </div>
        </div>

        <!-- Chart 2 : Repartition par type d'inscription (remontee a droite de
             Participants vs Inscrits). -->
        <div class="chart-card">
          <div class="chart-header">
            <h3>{{ t("overview.charts.byRegType") }} <InfoTooltip :text="t('overview.charts.byRegTypeHint')" /></h3>
            <CsvButton
              filename="types-inscription"
              :headers="[t('overview.csv.type'), t('overview.csv.totalRegistered'), t('overview.csv.physical'), t('overview.csv.liveReplayOnly'), t('overview.csv.noParticipation')]"
              :rows="registeredTypesBreakdown.map(row => [row.value, row.total, row.physical, row.remote, row.none])"
            />
          </div>
          <StackedBarChart
            :labels="registeredTypesBreakdown.slice(0, 8).map(row => row.value)"
            :datasets="participationDatasets(registeredTypesBreakdown.slice(0, 8))"
            :horizontal="true"
            :show-total="true"
            :height="320"
            :active-label="afm.regType"
            @select="onTypeSelect"
          />
        </div>

        <!-- Chart 3 : PARTICIPANTS (physique/live/replay) par type d'inscription.
             x = event(s), stacked par type (légende = types). Visible aussi en
             mode simple (1 seule barre, données de l'event courant). -->
        <div class="chart-card">
          <div class="chart-header">
            <h3>{{ t("overview.charts.participantsByBadge") }} <InfoTooltip :text="hasCompare ? t('overview.charts.participantsByBadgeHintCompare', { a: eventName, b: compareEventName }) : t('overview.charts.participantsByBadgeHint')" /></h3>
            <CsvButton
              filename="participants-type-inscription"
              :headers="hasCompare ? [t('overview.csv.type'), eventName, compareEventName] : [t('overview.csv.type'), eventName]"
              :rows="participationByRegTypeChart.types.map((type, i) => hasCompare
                ? [type, participationByRegTypeChart.datasets[i].data[0], participationByRegTypeChart.datasets[i].data[1]]
                : [type, participationByRegTypeChart.datasets[i].data[0]])"
            />
          </div>
          <StackedBarChart
            :labels="participationByRegTypeChart.labels"
            :datasets="participationByRegTypeChart.datasets"
            :show-total="true"
            :height="320"
            legend-position="bottom"
          />
        </div>
      </div>

      <!-- Chart 3 : Audience salle + live + replay, horizontal empile par event -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("overview.charts.audienceMix") }} <InfoTooltip :text="t('overview.charts.audienceMixHint')" /></h3>
          <CsvButton
            filename="audience-salle-live-replay"
            :headers="[t('overview.csv.event'), t('overview.csv.room'), t('overview.csv.live'), t('overview.csv.replay')]"
            :rows="audienceMixChart.labels.map((lbl, i) => [
              lbl,
              audienceMixChart.datasets[0].data[i],
              audienceMixChart.datasets[1].data[i],
              audienceMixChart.datasets[2].data[i],
            ])"
          />
        </div>
        <StackedBarChart
          :labels="audienceMixChart.labels"
          :datasets="audienceMixChart.datasets"
          :horizontal="true"
          :show-total="true"
          :height="hasCompare ? 220 : 150"
        />
        <p class="participation-note">
          {{ t("overview.charts.audienceNote") }}
        </p>
      </div>
    </div>

    <!-- Vue d'ensemble par type de session (tous modes : salle ∪ live ∪ replay).
         Cliquable -> filtre le Top sessions par delegues uniques ci-dessous. -->
    <div class="charts-row cols-1-2" v-if="overviewSessionTypes.length > 0">
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("overview.charts.sessionTypeTitle") }} <InfoTooltip :text="t('overview.charts.sessionTypeHint')" /></h3>
          <CsvButton
            filename="vue-ensemble-par-type-session"
            :headers="[t('scans.csv.type'), t('overview.csv.attendances'), t('scans.csv.uniqueDelegates')]"
            :rows="overviewSessionTypes.map(st => [st.type, st.attendances, st.uniqueDelegates])"
          />
        </div>
        <div class="origin-pie-wrap">
          <div class="origin-pie">
            <DoughnutChart
              :labels="overviewSessionTypes.map(st => st.type)"
              :data="overviewSessionTypes.map(st => st.attendances)"
              :colors="overviewSessionTypes.map(st => getTypeColor(st.type))"
              :active-label="selectedSessionType"
              @select="onSessionTypeSelect"
            />
          </div>
          <div class="origin-legend">
            <div v-for="st in overviewSessionTypes" :key="st.type"
              :class="['origin-legend-row', 'clickable', { active: selectedSessionType === st.type }]"
              @click="onSessionTypeSelect(st.type)">
              <span class="origin-swatch" :style="{ background: getTypeColor(st.type) }"></span>
              <span class="origin-name">{{ st.type }}</span>
              <strong>{{ fmt(st.attendances) }}</strong>
              <span class="origin-sub">{{ pctOfTypes(st.attendances) }}</span>
            </div>
          </div>
        </div>
        <div v-if="selectedSessionType" class="filter-active-bar">
          {{ t("overview.charts.sessionTypeFilterActive") }} <strong>{{ selectedSessionType }}</strong>
          <button class="filter-clear" @click="selectedSessionType = null">{{ t("viewers.charts.clearFilter") }}</button>
        </div>
      </div>

      <!-- Sessions par délégués uniques (tous modes), filtré par le type ci-dessus.
           1/3–2/3 + hauteur alignée sur la carte type voisine (scroll interne). -->
      <div class="chart-card session-list-card">
        <div class="chart-header">
          <h3>
            {{ t("overview.charts.topSessionsByType") }} <InfoTooltip :text="t('overview.charts.topSessionsByTypeHint')" />
            <span v-if="selectedSessionType" class="chart-hint">{{ t("viewers.charts.filtered") }}</span>
          </h3>
          <CsvButton
            filename="sessions-delegues-uniques"
            :headers="[t('scans.csv.session'), t('scans.csv.uniqueDelegates')]"
            :rows="overviewTopSessions.map(s => [s.label, s.uniqueDelegates])"
          />
        </div>
        <div class="session-scroll-host">
          <div class="session-scroll">
            <HBarChart
              v-if="overviewTopSessions.length > 0"
              :labels="overviewTopSessions.map(s => truncate(sessionLabel(s), 60))"
              :data="overviewTopSessions.map(s => s.uniqueDelegates)"
              :height="Math.max(160, overviewTopSessions.length * 22 + 40)"
              color="#6F45FF"
            />
            <p v-else class="empty-msg">{{ t("scans.empty.noAudience") }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="charts-row" >
      <div class="chart-card" v-if="onboardingDaily.length > 0">
        <div class="chart-header">
          <h3>{{ t("overview.charts.onboardingEvolution") }}</h3>
          <CsvButton filename="onboarding" :headers="[t('overview.csv.date'), t('overview.csv.connections')]" :rows="onboardingDaily.map(d => [d.date, d.count])" />
        </div>
        <LineChart
          :labels="onboardingLabels"
          :datasets="onboardingDatasets"
          :height="220"
        />
      </div>
      <div class="chart-card" v-if="mobileAppDaily.length > 0">
        <div class="chart-header">
          <h3>{{ t("overview.charts.mobileAppUsage") }}</h3>
          <CsvButton filename="mobile-app" :headers="[t('overview.csv.date'), t('overview.csv.users')]" :rows="mobileAppDaily.map(d => [d.date, d.count])" />
        </div>
        <LineChart
          :labels="mobileAppLabels"
          :datasets="mobileAppDatasets"
          :height="220"
        />
      </div>
    </div>

    <!-- Repartition geographique des participants (monde | Europe), filtree par
         la modalite de participation. Placee sous onboarding / mobile. -->
    <div class="charts-row" v-if="!liveLoading && !replayLoading">
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("maps.worldTitle") }} <InfoTooltip :text="t('overview.charts.geoHint')" /></h3>
          <CsvButton
            filename="participants-par-pays-monde"
            :headers="[t('overview.csv.countryCode'), t('overview.csv.delegates')]"
            :rows="geoCountries.map(c => [c.value, c.totalCount])"
          />
        </div>
        <ChoroplethMap :key="`world-${geoCacheKey}`" :countries="geoCountries" scope="world" :show-legend="true" :height="420" />
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("maps.europeTitle") }} <InfoTooltip :text="t('overview.charts.geoHint')" /></h3>
          <CsvButton
            filename="participants-par-pays-europe"
            :headers="[t('overview.csv.countryCode'), t('overview.csv.delegates')]"
            :rows="geoCountriesEurope.map(c => [c.value, c.totalCount])"
          />
        </div>
        <ChoroplethMap :key="`europe-${geoCacheKey}`" :countries="geoCountries" scope="europe" :show-legend="true" :height="420" />
      </div>
    </div>

    <!-- Le cumul des délégués replay a été déplacé sur l'onglet Replay. -->

  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Bar } from "vue-chartjs";
import StackedBarChart from "../charts/StackedBarChart.vue";
import LineChart from "../charts/LineChart.vue";
import DoughnutChart from "../charts/DoughnutChart.vue";
import HBarChart from "../charts/HBarChart.vue";
import ChoroplethMap from "../charts/ChoroplethMap.vue";
import FilterBanner from "../FilterBanner.vue";
import CsvButton from "../CsvButton.vue";
import InfoTooltip from "../InfoTooltip.vue";
import { COUNTRY_CONTINENTS } from "@/utils/countries.js";
import { useFilteredStats } from "../../composables/useFilteredStats.js";
import { makeDateLabeler } from "../../utils/formatDateLabel.js";
import { getTypeColor, getTypeColors } from "../../utils/typeColors.js";
import { delegateBadgeType } from "@/utils/checkinByType.js";
import { computeParticipation } from "@/utils/participation.js";
import { buildDelegateLookup } from "@/utils/viewerJoin.js";
import { computeAllStats } from "@/utils/computeStats.js";
import { sessionDateShort } from "@/utils/parisTime.js";
import { fmt, pct } from "@/utils/formatters.js";

const { t } = useI18n();

const props = defineProps({
  stats: Object,
  delegates: Array,
  mobileAppId: String,
  eventName: String,
  compareDelegates: { type: Array, default: () => [] },
  compareEventName: { type: String, default: "" },
  // Instances live/replay proprietees par StatisticsView (timer + cache mutualises).
  liveApi: { type: Object, required: true },
  replayApi: { type: Object, required: true },
  compareLiveApi: { type: Object, default: null },
  compareReplayApi: { type: Object, default: null },
  // Instance scans onsite (audience + checkin + zone) proprietee par StatisticsView.
  // Sert au chart "Audience : salle + live + replay".
  scansApi: { type: Object, default: null },
  // Scans de l'event compare (?compareWith=) — alimente la barre "Salle" cote B.
  compareScansApi: { type: Object, default: null },
  // Filtre badge type lifte au niveau StatisticsView (etat partage Overview/Badges/Comparison).
  badgeFilter: { type: Object, required: true },
  // Plage de dates globale (filtre par activite) — propagee a useFilteredStats + participation.
  dateRange: { type: Object, default: null },
});

// --- KPIs Live / Replay : instances heritees de StatisticsView (cf. props).
const { loading: liveLoading, stats: liveStats } = props.liveApi;
const { loading: replayLoading, stats: replayStats } = props.replayApi;
const liveB = props.compareLiveApi;
const replayB = props.compareReplayApi;
const hasCompare = !!liveB;

const liveUniqueUsers = computed(() => liveStats.value?.global?.uniqueUsers || 0);
const replayUniqueUsers = computed(() => replayStats.value?.global?.uniqueUsers || 0);

// --- Filtre global badge type : etat partage avec Badges/Comparison via
// StatisticsView (cf. useBadgeTypeFilter). Applique sur les 2 cotes (A et B)
// pour preserver le sens des % d'evolution.
const {
  selected: selectedBadgeTypes,
  allBadgeTypes: availableBadgeTypes,
  filteredDelegates: pageFilteredDelegates,
  filteredCompareDelegates: pageFilteredCompareDelegates,
  toggle: toggleBadgeType,
  clear: clearBadgeTypes,
  setSelection: setBadgeTypes,
} = props.badgeFilter;

// --- KPI "Total participants" = check-in physique UNION live distanciel
// UNION replay distanciel, dedupe sur delegate.id Mongo (un meme delegue ne
// compte qu'une fois, meme s'il a vu live + replay sans venir). Logique
// extraite dans utils/participation.js et partagee avec l'export MD. Cf.
// utils/viewerJoin.js pour la jointure ES (user_id keycloak) <-> delegate
// (emailAddresses[].source.id ACCOUNT).
const participation = computed(() =>
  computeParticipation(
    pageFilteredDelegates.value,
    liveStats.value?.items,
    replayStats.value?.items,
    { datasetLabel: "overview-current", dateRange: props.dateRange },
  ),
);
// Sets reutilises par buildParticipationBreakdown (decomposition par type/categorie).
// NB : non affectes par le filtre "mode de consultation" (qui ne pilote que le
// bloc "Total participants").
const physicallyCheckedInSet = computed(() => participation.value.checkedIn);
const liveRemoteSet = computed(() => participation.value.liveRemote);
const replayRemoteSet = computed(() => participation.value.replayRemote);

// --- Filtre "Modalité de participation" (PHYSIQUE / LIVE / REPLAY) ---
// Multi-select, tout coche par defaut. Une sous-categorie de la decomposition
// reste comptee si elle implique AU MOINS UN mode selectionne. Les 7 categories
// etant DISJOINTES, le total se recalcule par simple somme des categories visibles.
const ALL_MODES = ["PHYSIQUE", "LIVE", "REPLAY"];
const selectedModes = ref(new Set(ALL_MODES));
function toggleMode(m) {
  const next = new Set(selectedModes.value);
  if (next.has(m)) next.delete(m);
  else next.add(m);
  // Jamais tout decocher (bloc vide) -> on retombe sur "tout".
  selectedModes.value = next.size === 0 ? new Set(ALL_MODES) : next;
}
const isModeOn = (m) => selectedModes.value.has(m);
// Libelle affiche des pills de mode (les cles internes restent PHYSIQUE/LIVE/REPLAY).
const modeLabel = (m) =>
  ({ PHYSIQUE: t("overview.modes.physique"), LIVE: t("overview.modes.live"), REPLAY: t("overview.modes.replay") })[m] || m;
const CATEGORY_MODES = {
  checkedInOnly: ["PHYSIQUE"],
  checkedInLive: ["PHYSIQUE", "LIVE"],
  checkedInReplay: ["PHYSIQUE", "REPLAY"],
  checkedInLiveReplay: ["PHYSIQUE", "LIVE", "REPLAY"],
  liveOnly: ["LIVE"],
  both: ["LIVE", "REPLAY"],
  replayOnly: ["REPLAY"],
};
function applyModeFilter(counts) {
  const v = (cat) =>
    CATEGORY_MODES[cat].some((m) => selectedModes.value.has(m)) ? counts[cat] || 0 : 0;
  const checkedInOnly = v("checkedInOnly");
  const checkedInLive = v("checkedInLive");
  const checkedInReplay = v("checkedInReplay");
  const checkedInLiveReplay = v("checkedInLiveReplay");
  const liveOnly = v("liveOnly");
  const both = v("both");
  const replayOnly = v("replayOnly");
  const checkedIn = checkedInOnly + checkedInLive + checkedInReplay + checkedInLiveReplay;
  return {
    checkedIn, checkedInOnly, checkedInLive, checkedInReplay, checkedInLiveReplay,
    liveOnly, both, replayOnly,
    total: checkedIn + liveOnly + both + replayOnly,
  };
}
// Counts FILTRES par mode (source unique du bloc "Total participants" : cards,
// barre, legende, deltas, scale).
const fc = computed(() => applyModeFilter(participation.value.counts));

// Counts pour la decomposition visuelle (chips + barre + legende) — lus depuis fc.
const physicallyCheckedInCount = computed(() => fc.value.checkedIn);
const checkedInOnlyCount = computed(() => fc.value.checkedInOnly);
const checkedInLiveCount = computed(() => fc.value.checkedInLive);
const checkedInReplayCount = computed(() => fc.value.checkedInReplay);
const checkedInLiveReplayCount = computed(() => fc.value.checkedInLiveReplay);
const liveOnlyRemoteCount = computed(() => fc.value.liveOnly);
const bothRemoteCount = computed(() => fc.value.both);
const replayOnlyRemoteCount = computed(() => fc.value.replayOnly);
const totalParticipants = computed(() => fc.value.total);

// --- Side B : meme decomposition pour le compareEventId (si present).
// Permet d'afficher un delta % sur chaque chip de la decomposition.
const participationB = computed(() =>
  hasCompare
    ? computeParticipation(
        pageFilteredCompareDelegates.value,
        liveB?.stats.value?.items,
        replayB?.stats.value?.items,
        { datasetLabel: "overview-compare", dateRange: props.dateRange },
      )
    : { counts: { checkedIn: 0, checkedInOnly: 0, checkedInLive: 0, checkedInReplay: 0, checkedInLiveReplay: 0, liveOnly: 0, both: 0, replayOnly: 0, total: 0 } },
);
// Counts B filtres par le meme mode de consultation (coherence des deltas).
const fcB = computed(() => applyModeFilter(participationB.value.counts));
const checkedInBCount = computed(() => fcB.value.checkedIn);
const checkedInOnlyBCount = computed(() => fcB.value.checkedInOnly);
const checkedInLiveBCount = computed(() => fcB.value.checkedInLive);
const checkedInReplayBCount = computed(() => fcB.value.checkedInReplay);
const checkedInLiveReplayBCount = computed(() => fcB.value.checkedInLiveReplay);
const liveOnlyRemoteBCount = computed(() => fcB.value.liveOnly);
const bothRemoteBCount = computed(() => fcB.value.both);
const replayOnlyRemoteBCount = computed(() => fcB.value.replayOnly);
const totalParticipantsB = computed(() => fcB.value.total);

// Calcule un delta % (a vs b). Si b == 0 et a > 0 : "Nouveau" (vert).
// Si a == 0 et b > 0 : "-100%" (rouge). Sinon : signe + pct + classe.
function buildDeltaPct(a, b) {
  if (!hasCompare) return null;
  if (b === 0 && a === 0) return { arrow: "=", text: "0%", cls: "delta--neutral" };
  if (b === 0) return { arrow: "▲", text: t("overview.misc.new"), cls: "delta--good" };
  if (a === 0) return { arrow: "▼", text: "-100%", cls: "delta--bad" };
  const diff = ((a - b) / b) * 100;
  if (Math.abs(diff) < 0.5) return { arrow: "=", text: "0%", cls: "delta--neutral" };
  const arrow = diff > 0 ? "▲" : "▼";
  const sign = diff > 0 ? "+" : "−";
  const cls = diff > 0 ? "delta--good" : "delta--bad";
  return { arrow, text: `${sign}${Math.abs(diff).toFixed(1)}%`, cls };
}

const deltaCheckin = computed(() => buildDeltaPct(physicallyCheckedInCount.value, checkedInBCount.value));
const deltaCheckinOnly = computed(() => buildDeltaPct(checkedInOnlyCount.value, checkedInOnlyBCount.value));
const deltaCheckinLive = computed(() => buildDeltaPct(checkedInLiveCount.value, checkedInLiveBCount.value));
const deltaLiveOnly = computed(() => buildDeltaPct(liveOnlyRemoteCount.value, liveOnlyRemoteBCount.value));
const deltaBoth = computed(() => buildDeltaPct(bothRemoteCount.value, bothRemoteBCount.value));
const deltaReplayOnly = computed(() => buildDeltaPct(replayOnlyRemoteCount.value, replayOnlyRemoteBCount.value));
const deltaTotal = computed(() => buildDeltaPct(totalParticipants.value, totalParticipantsB.value));

// Tooltip detaille sur chaque badge delta : ecart absolu (+N / -N) + valeur
// de l'event compare. Affiche au survol via attribut title. On expose des
// computeds (pas une fonction qui prend des refs en argument) — c'est plus
// sur pour la reactivite dans les templates.
function makeTooltip(a, b) {
  if (!hasCompare) return "";
  const diff = (a ?? 0) - (b ?? 0);
  const diffStr = diff > 0 ? `+${fmt(diff)}` : fmt(diff);
  const name = props.compareEventName || t("overview.misc.eventComparedFallback");
  return t("overview.misc.tooltipDelegates", { diff: diffStr, name, value: fmt(b ?? 0) });
}
const tooltipCheckin = computed(() => makeTooltip(physicallyCheckedInCount.value, checkedInBCount.value));
const tooltipCheckinOnly = computed(() => makeTooltip(checkedInOnlyCount.value, checkedInOnlyBCount.value));
const tooltipCheckinLive = computed(() => makeTooltip(checkedInLiveCount.value, checkedInLiveBCount.value));
const tooltipLiveOnly = computed(() => makeTooltip(liveOnlyRemoteCount.value, liveOnlyRemoteBCount.value));
const tooltipBoth = computed(() => makeTooltip(bothRemoteCount.value, bothRemoteBCount.value));
const tooltipReplayOnly = computed(() => makeTooltip(replayOnlyRemoteCount.value, replayOnlyRemoteBCount.value));
const tooltipTotal = computed(() => makeTooltip(totalParticipants.value, totalParticipantsB.value));

const {
  filteredStats: fs, activeFilters, activeFilterMap: afm,
  hasFilters, filteredCount, toggleFilter, removeFilter, clearFilters,
} = useFilteredStats(() => pageFilteredDelegates.value, () => props.mobileAppId, () => props.dateRange);

// pctNum garde la version numerique (pour calculs / deltas), distincte de pct
// qui renvoie une string formatee "12.3%".
const pctNum = (a, b) => (b > 0 ? (a / b) * 100 : 0);

// Mise a l'echelle des barres de participation : la longueur totale de chaque
// barre est proportionnelle au total de SON event, rapporte au plus grand des
// deux totaux (l'event le plus gros occupe 100% de la largeur, l'autre une
// fraction). Permet de comparer les volumes d'un coup d'oeil (avant : les 2
// barres faisaient 100% chacune, l'ecart de volume etait invisible). Sans
// comparaison, la barre unique reste a 100%.
const maxParticipants = computed(() =>
  Math.max(totalParticipants.value, hasCompare ? totalParticipantsB.value : 0),
);
const barScaleA = computed(() =>
  maxParticipants.value > 0 ? (totalParticipants.value / maxParticipants.value) * 100 : 100,
);
const barScaleB = computed(() =>
  maxParticipants.value > 0 ? (totalParticipantsB.value / maxParticipants.value) * 100 : 100,
);

// --- 3 grands modes de participation (regroupement des 5 sous-categories) ---
// Physique         = sur place seul + sur place & live   (= physicallyCheckedIn)
// Live distanciel  = live seul + (live & replay)          (a vu en live, sans venir)
// Replay distanciel= replay seul                          (a vu uniquement en replay)
// La somme des 3 == total participants. Le delta/tooltip "physique" reutilise
// deltaCheckin (physique == check-in physique), "replay" reutilise deltaReplayOnly.
const physiqueCount = physicallyCheckedInCount; // alias lisible
const liveModeCount = computed(() => liveOnlyRemoteCount.value + bothRemoteCount.value);
const liveModeBCount = computed(() => liveOnlyRemoteBCount.value + bothRemoteBCount.value);
const replayModeCount = replayOnlyRemoteCount; // alias
const deltaPhysique = deltaCheckin;
const deltaLiveMode = computed(() => buildDeltaPct(liveModeCount.value, liveModeBCount.value));
const deltaReplayMode = deltaReplayOnly;
const tooltipPhysique = tooltipCheckin;
const tooltipLiveMode = computed(() => makeTooltip(liveModeCount.value, liveModeBCount.value));
const tooltipReplayMode = tooltipReplayOnly;

// Structure de barre : 3 zones (modes), chacune subdivisee en sous-segments.
// Permet un rendu en 3 blocs colores distincts (vert / bleu / violet) separes
// par un petit espace, chaque bloc montrant sa composition interne. `c` = objet
// counts de computeParticipation.
function buildZones(c) {
  return [
    {
      key: "physique",
      label: t("overview.participation.physical"),
      total: c.checkedInOnly + c.checkedInLive + c.checkedInReplay + c.checkedInLiveReplay,
      segments: [
        { cls: "seg-checkin-only", label: t("overview.participation.onsiteOnly"), count: c.checkedInOnly },
        { cls: "seg-checkin-live", label: t("overview.participation.onsitePlusLive"), count: c.checkedInLive },
        { cls: "seg-checkin-livereplay", label: t("overview.participation.onsitePlusLiveReplay"), count: c.checkedInLiveReplay },
        { cls: "seg-checkin-replay", label: t("overview.participation.onsitePlusReplay"), count: c.checkedInReplay },
      ],
    },
    {
      key: "live",
      label: t("overview.participation.liveRemote"),
      total: c.liveOnly + c.both,
      segments: [
        { cls: "seg-live-only", label: t("overview.participation.liveOnly"), count: c.liveOnly },
        { cls: "seg-both", label: t("overview.participation.liveAndReplay"), count: c.both },
      ],
    },
    {
      key: "replay",
      label: t("overview.participation.replayRemote"),
      total: c.replayOnly,
      segments: [
        { cls: "seg-replay-only", label: t("overview.participation.replayOnly"), count: c.replayOnly },
      ],
    },
  ];
}
const zonesA = computed(() => buildZones(fc.value));
const zonesB = computed(() => buildZones(fcB.value));

const registeredCount = computed(() =>
  pageFilteredDelegates.value.filter((d) => d.status?.toLowerCase() === "registered").length
);
const registeredCountB = computed(() =>
  pageFilteredCompareDelegates.value.filter((d) => d.status?.toLowerCase() === "registered").length
);

// --- KPI : delta % vs event compare (seulement si ?compareWith=). Reutilise
// buildDeltaPct (renvoie null hors comparaison -> v-if cache le badge) et
// makeTooltip (valeurs absolues de l'event compare au survol). Valeurs B via
// computeAllStats sur les delegues compares = meme logique que fs cote A
// (check-in / onboarding / mobile dans global, + filtre date).
const compareStats = computed(() =>
  hasCompare
    ? computeAllStats(pageFilteredCompareDelegates.value, props.mobileAppId, props.dateRange)
    : null,
);
const checkedInGlobalB = computed(() => compareStats.value?.global.checkedInCount || 0);
const onboardingB = computed(() => compareStats.value?.global.onboardingCount || 0);
const mobileAppB = computed(() => compareStats.value?.global.mobileAppCount || 0);
const liveUniqueUsersB = computed(() => liveB?.stats.value?.global?.uniqueUsers || 0);
const replayUniqueUsersB = computed(() => replayB?.stats.value?.global?.uniqueUsers || 0);

const deltaRegisteredKpi = computed(() => buildDeltaPct(registeredCount.value, registeredCountB.value));
const deltaCheckinKpi = computed(() => buildDeltaPct(fs.value.global.checkedInCount, checkedInGlobalB.value));
const deltaOnboardingKpi = computed(() => buildDeltaPct(fs.value.global.onboardingCount, onboardingB.value));
const deltaMobileKpi = computed(() => buildDeltaPct(fs.value.global.mobileAppCount, mobileAppB.value));
const deltaLiveKpi = computed(() => buildDeltaPct(liveUniqueUsers.value, liveUniqueUsersB.value));
const deltaReplayKpi = computed(() => buildDeltaPct(replayUniqueUsers.value, replayUniqueUsersB.value));

const tipRegisteredKpi = computed(() => makeTooltip(registeredCount.value, registeredCountB.value));
const tipCheckinKpi = computed(() => makeTooltip(fs.value.global.checkedInCount, checkedInGlobalB.value));
const tipOnboardingKpi = computed(() => makeTooltip(fs.value.global.onboardingCount, onboardingB.value));
const tipMobileKpi = computed(() => makeTooltip(fs.value.global.mobileAppCount, mobileAppB.value));
const tipLiveKpi = computed(() => makeTooltip(liveUniqueUsers.value, liveUniqueUsersB.value));
const tipReplayKpi = computed(() => makeTooltip(replayUniqueUsers.value, replayUniqueUsersB.value));

// Libelles d'axe pour les charts comparatifs Vue d'ensemble : 1 ou 2 events.
const eventAxisLabels = computed(() =>
  hasCompare
    ? [props.eventName || t("overview.misc.axisEventA"), props.compareEventName || t("overview.misc.axisEventB")]
    : [props.eventName || t("overview.misc.axisEvent")],
);

// --- Chart 1 : Participants (physique+live+replay dedoublonne) vs Inscrits
// (registered), groupe par event. Barres groupees (non empilees).
const participantsVsRegisteredData = computed(() => ({
  labels: eventAxisLabels.value,
  datasets: [
    {
      label: t("overview.datasets.registrations"),
      data: hasCompare ? [registeredCount.value, registeredCountB.value] : [registeredCount.value],
      backgroundColor: "#1E4E66",
      borderRadius: 4,
      maxBarThickness: 90,
    },
    {
      label: t("overview.datasets.participants"),
      data: hasCompare ? [totalParticipants.value, totalParticipantsB.value] : [totalParticipants.value],
      backgroundColor: "#30DD92",
      borderRadius: 4,
      maxBarThickness: 90,
    },
  ],
}));

const groupedBarOptions = {
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 18 } },
  plugins: {
    legend: { position: "top", labels: { font: { size: 13 }, usePointStyle: true, pointStyle: "rectRounded" } },
    datalabels: {
      display: true, anchor: "end", align: "end", offset: 2, clip: false,
      color: "#414141", font: { weight: 600, size: 13 },
      formatter: (v) => (v > 0 ? v.toLocaleString("fr-FR") : ""),
    },
    tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label} : ${ctx.raw.toLocaleString("fr-FR")}` } },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 13 } } },
    // grace : marge haute pour que les totaux en bout de barre ne chevauchent
    // pas la legende du haut.
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 13 } }, beginAtZero: true, grace: "12%" },
  },
};

// --- Chart 2 : Participants par type de badge, empile par event. Chaque
// participant (physique OU distanciel) compte une fois pour son type de badge
// (delegateBadgeType). Somme des segments d'un event == total participants.
function participantsByBadgeType(delegates, part) {
  const phyIds = part.checkedIn;
  const remoteIds = new Set([...part.liveRemote, ...part.replayRemote]);
  const byType = new Map();
  for (const d of delegates || []) {
    if (d.status?.toLowerCase() !== "registered") continue;
    if (!phyIds.has(d.id) && !remoteIds.has(d.id)) continue;
    const type = delegateBadgeType(d);
    byType.set(type, (byType.get(type) || 0) + 1);
  }
  return byType;
}
const participantsByTypeChart = computed(() => {
  const mapA = participantsByBadgeType(pageFilteredDelegates.value, participation.value);
  const mapB = hasCompare
    ? participantsByBadgeType(pageFilteredCompareDelegates.value, participationB.value)
    : new Map();
  const types = [...new Set([...mapA.keys(), ...mapB.keys()])].sort(
    (t1, t2) =>
      (mapA.get(t2) || 0) + (mapB.get(t2) || 0) - ((mapA.get(t1) || 0) + (mapB.get(t1) || 0)),
  );
  const datasets = types.map((type) => ({
    label: type,
    data: hasCompare ? [mapA.get(type) || 0, mapB.get(type) || 0] : [mapA.get(type) || 0],
    backgroundColor: getTypeColor(type),
    borderRadius: 4,
  }));
  return { labels: eventAxisLabels.value, datasets, types };
});

// --- Chart 3 : Audience par canal (salle / live / replay), empile par event,
// horizontal. "Salle" = vues en salle = delegues uniques scannes en salle
// cumules par session (audienceUniqueDelegateSessions, cf. computeScanStats) —
// la vraie affluence des conferences, vs le nombre brut de scans qui sur-compte
// les multi-passages. "Live"/"Replay" = vues totales ES. Les scans de l'event
// compare sont desormais charges (compareScansApi) -> Salle B renseignee.
// --- Vue d'ensemble par type de session (TOUS modes : Salle ∪ Live ∪ Replay) ---
// Une seule structure par session, agregeant les delegues distincts quel que
// soit le mode de consultation : salle (scans audience, delegateId Mongo), live
// et replay (user_id Keycloak -> delegate.id via buildDelegateLookup, fallback
// kc:<id> si non rapproche). Un delegue present en salle ET en live/replay sur
// la meme session n'est compte qu'une fois (identite prefixee id:/kc:). Respecte
// le filtre de modalite page-level (selectedModes), comme l'engagement.
const combinedSessions = computed(() => {
  const lookup = buildDelegateLookup(pageFilteredDelegates.value, { datasetLabel: "overview-session-types" });
  const map = new Map(); // sessionId -> { id, title, type, delegates:Set<identity> }
  const add = (sessionId, title, type, identity, start) => {
    if (!sessionId || !identity) return;
    let e = map.get(sessionId);
    if (!e) {
      e = { id: sessionId, title: title || sessionId, type: type || "Non renseigné", start: start || null, delegates: new Set() };
      map.set(sessionId, e);
    }
    if (title && e.title === sessionId) e.title = title;
    if (type && e.type === "Non renseigné") e.type = type;
    if (start && !e.start) e.start = start;
    e.delegates.add(identity);
  };
  if (selectedModes.value.has("PHYSIQUE")) {
    for (const s of props.scansApi?.stats?.value?.audience?.scans || []) {
      if (!s.delegateId || s.delegateId === "-") continue;
      add(s.sessionId, s.sessionTitle, s.sessionType, `id:${s.delegateId}`, s.sessionStart);
    }
  }
  if (selectedModes.value.has("LIVE")) {
    for (const it of liveStats.value?.items || []) {
      const d = lookup.get(it.userId)?.delegate?.id;
      add(it.sessionId, it.sessionTitle, it.sessionType, d ? `id:${d}` : `kc:${it.userId}`, it.sessionStart);
    }
  }
  if (selectedModes.value.has("REPLAY")) {
    for (const it of replayStats.value?.items || []) {
      const d = lookup.get(it.userId)?.delegate?.id;
      add(it.sessionId, it.sessionTitle, it.sessionType, d ? `id:${d}` : `kc:${it.userId}`, it.sessionStart);
    }
  }
  return map;
});
// Repartition par type : presences = somme des delegues distincts par session du
// type (additive, bonne pour un camembert) ; uniqueDelegates = delegues distincts
// du type (union, pour le CSV).
const overviewSessionTypes = computed(() => {
  const byType = new Map();
  for (const sess of combinedSessions.value.values()) {
    let e = byType.get(sess.type);
    if (!e) { e = { attendances: 0, delegates: new Set() }; byType.set(sess.type, e); }
    e.attendances += sess.delegates.size;
    for (const d of sess.delegates) e.delegates.add(d);
  }
  return [...byType.entries()]
    .map(([type, v]) => ({ type, attendances: v.attendances, uniqueDelegates: v.delegates.size }))
    .sort((a, b) => b.attendances - a.attendances);
});
const overviewSessionTypesTotal = computed(
  () => overviewSessionTypes.value.reduce((s, st) => s + st.attendances, 0),
);
function pctOfTypes(v) {
  const total = overviewSessionTypesTotal.value;
  if (!total) return "0%";
  return `${((v / total) * 100).toFixed(1)}%`;
}
function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
// Libelle d'une session de top : "JJ/MM : titre" (date de session en prefixe).
function sessionLabel(s) {
  const d = sessionDateShort(s.start);
  return d ? `${d} : ${s.label}` : s.label;
}
// Filtre cross-clic : selectionner un type restreint le Top sessions ci-dessous.
const selectedSessionType = ref(null);
function onSessionTypeSelect(type) {
  selectedSessionType.value = selectedSessionType.value === type ? null : type;
}
// Top sessions par delegues uniques (tous modes), filtre par le type selectionne.
const overviewTopSessions = computed(() => {
  let sessions = [...combinedSessions.value.values()];
  if (selectedSessionType.value) sessions = sessions.filter((s) => s.type === selectedSessionType.value);
  return sessions
    .map((s) => ({ id: s.id, label: s.title, start: s.start, uniqueDelegates: s.delegates.size }))
    .sort((a, b) => b.uniqueDelegates - a.uniqueDelegates);
});

const scanAudienceViewsA = computed(
  () => props.scansApi?.stats?.value?.global?.audienceUniqueDelegateSessions || 0,
);
const scanAudienceViewsB = computed(
  () => props.compareScansApi?.stats?.value?.global?.audienceUniqueDelegateSessions || 0,
);
const audienceMixChart = computed(() => {
  const liveViewsA = liveStats.value?.global?.totalViews || 0;
  const replayViewsA = replayStats.value?.global?.totalViews || 0;
  if (!hasCompare) {
    return {
      labels: eventAxisLabels.value,
      datasets: [
        { label: t("overview.datasets.room"), data: [scanAudienceViewsA.value], backgroundColor: "#1E4E66", borderRadius: 4 },
        { label: t("overview.datasets.live"), data: [liveViewsA], backgroundColor: "#30DD92", borderRadius: 4 },
        { label: t("overview.datasets.replay"), data: [replayViewsA], backgroundColor: "#6F45FF", borderRadius: 4 },
      ],
    };
  }
  const liveViewsB = liveB?.stats.value?.global?.totalViews || 0;
  const replayViewsB = replayB?.stats.value?.global?.totalViews || 0;
  return {
    labels: eventAxisLabels.value,
    datasets: [
      { label: t("overview.datasets.room"), data: [scanAudienceViewsA.value, scanAudienceViewsB.value], backgroundColor: "#1E4E66", borderRadius: 4 },
      { label: t("overview.datasets.live"), data: [liveViewsA, liveViewsB], backgroundColor: "#30DD92", borderRadius: 4 },
      { label: t("overview.datasets.replay"), data: [replayViewsA, replayViewsB], backgroundColor: "#6F45FF", borderRadius: 4 },
    ],
  };
});

// --- Decomposition participation par type / categorie ---
// Calcule pour chaque registration type (et chaque categorie) le nombre de
// delegues registered :
//   - physical : checkedInDate valide (presents sur place)
//   - remote   : pas physique mais vu en live ou replay
//   - none     : aucune participation detectee (inscrits no-show)
// La somme des 3 == nombre total de registered ayant ce type / cette categorie.
// Note : un delegate avec plusieurs registrations compte dans chacun de ses
// types / categories (meme logique que fs.registrations.types.totalCount).
function buildParticipationBreakdown(extractKeys) {
  const phyIds = physicallyCheckedInSet.value;
  const remoteIds = new Set([...liveRemoteSet.value, ...replayRemoteSet.value]);
  const byKey = new Map();
  for (const d of pageFilteredDelegates.value) {
    if (d.status?.toLowerCase() !== "registered") continue;
    const isPhy = phyIds.has(d.id);
    const isRemote = !isPhy && remoteIds.has(d.id);
    const keys = extractKeys(d);
    for (const k of keys) {
      if (!byKey.has(k)) byKey.set(k, { physical: 0, remote: 0, none: 0 });
      const b = byKey.get(k);
      if (isPhy) b.physical++;
      else if (isRemote) b.remote++;
      else b.none++;
    }
  }
  return [...byKey.entries()]
    .map(([value, b]) => ({
      value,
      total: b.physical + b.remote + b.none,
      physical: b.physical,
      remote: b.remote,
      none: b.none,
    }))
    .sort((a, b) => b.total - a.total);
}

const registeredTypesBreakdown = computed(() =>
  buildParticipationBreakdown((d) => {
    const set = new Set();
    for (const r of d.registrations || []) if (r.type) set.add(r.type);
    return set;
  }),
);

// --- Comparaison des PARTICIPANTS (physique OU live OU replay, dedupe) par
// TYPE d'inscription, par event. x = events (A/B), y = nombre, stacked par type
// (legende = types). Population = ceux qui ont participe (exclut les no-show).
// Un delegue multi-types compte dans chacun de ses types.
function participantsByRegType(delegates, part) {
  const phyIds = part?.checkedIn || new Set();
  const remoteIds = new Set([...(part?.liveRemote || []), ...(part?.replayRemote || [])]);
  const byType = new Map();
  for (const d of delegates || []) {
    if (d.status?.toLowerCase() !== "registered") continue;
    if (!phyIds.has(d.id) && !remoteIds.has(d.id)) continue;
    const set = new Set();
    for (const r of d.registrations || []) if (r.type) set.add(r.type);
    for (const t of set) byType.set(t, (byType.get(t) || 0) + 1);
  }
  return byType;
}
const participationByRegTypeChart = computed(() => {
  const mapA = participantsByRegType(pageFilteredDelegates.value, participation.value);
  const mapB = participantsByRegType(pageFilteredCompareDelegates.value, participationB.value);
  const types = [...new Set([...mapA.keys(), ...mapB.keys()])].sort(
    (t1, t2) => (mapA.get(t2) || 0) + (mapB.get(t2) || 0) - ((mapA.get(t1) || 0) + (mapB.get(t1) || 0)),
  );
  const datasets = types.map((type) => ({
    label: type,
    data: [mapA.get(type) || 0, mapB.get(type) || 0],
    backgroundColor: getTypeColor(type),
    borderRadius: 4,
  }));
  return { labels: eventAxisLabels.value, datasets, types };
});

const registeredCategoriesBreakdown = computed(() =>
  buildParticipationBreakdown((d) => {
    const set = new Set();
    for (const r of d.registrations || []) {
      for (const c of r.categories || []) if (c) set.add(c);
    }
    return set;
  }),
);

// Construit les 3 datasets (physique / distanciel-seul / aucune) pour
// StackedBarChart depuis le breakdown.
function participationDatasets(breakdown) {
  return [
    {
      label: t("overview.datasets.physical"),
      data: breakdown.map((b) => b.physical),
      backgroundColor: "#30DD92",
      borderRadius: 4,
    },
    {
      label: t("overview.datasets.liveReplayOnly"),
      data: breakdown.map((b) => b.remote),
      backgroundColor: "#6F45FF",
      borderRadius: 4,
    },
    {
      label: t("overview.datasets.noParticipation"),
      data: breakdown.map((b) => b.none),
      backgroundColor: "#D1D5DB",
      borderRadius: 4,
    },
  ];
}

// --- Filtres ---
function onTypeSelect(label) {
  toggleFilter("regType", label, (d) => (d.registrations || []).some((r) => r.type === label));
}
function onCategorySelect(label) {
  toggleFilter("category", label, (d) =>
    (d.registrations || []).some((r) => (r.categories || []).includes(label))
  );
}

// --- Computed charts ---

// --- Mobile app timeline ---
const mobileAppDaily = computed(() => fs.value?.mobileApp?.daily || []);
const mobileAppLabels = computed(() => {
  const dates = mobileAppDaily.value.map((d) => d.date);
  const labelFor = makeDateLabeler(dates);
  return dates.map(labelFor);
});
const mobileAppDatasets = computed(() => {
  const daily = mobileAppDaily.value.map((d) => d.count);
  let cumul = 0;
  const cumulData = daily.map((v) => { cumul += v; return cumul; });
  return [
    {
      label: t("overview.datasets.usersCumul"),
      data: cumulData,
      borderColor: "#6F45FF",
      backgroundColor: "rgba(111,69,255,0.08)",
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2.5,
    },
    {
      label: t("overview.datasets.usersPerDay"),
      data: daily,
      borderColor: "#30DD92",
      backgroundColor: "rgba(48,221,146,0.4)",
      type: "bar",
      borderRadius: 3,
      barThickness: Math.max(2, Math.min(8, 600 / daily.length)),
      yAxisID: "y1",
    },
  ];
});

// Toutes les inscriptions depuis le premier delegate
// --- Onboarding timeline ---
const onboardingDaily = computed(() => fs.value?.onboarding?.daily || []);
const onboardingLabels = computed(() => {
  const dates = onboardingDaily.value.map((d) => d.date);
  const labelFor = makeDateLabeler(dates);
  return dates.map(labelFor);
});
const onboardingDatasets = computed(() => {
  const daily = onboardingDaily.value.map((d) => d.count);
  let cumul = 0;
  const cumulData = daily.map((v) => { cumul += v; return cumul; });
  return [
    {
      label: t("overview.datasets.connectionsCumul"),
      data: cumulData,
      borderColor: "#FFA600",
      backgroundColor: "rgba(255,166,0,0.08)",
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2.5,
    },
    {
      label: t("overview.datasets.connectionsPerDay"),
      data: daily,
      borderColor: "#30DD92",
      backgroundColor: "rgba(48,221,146,0.4)",
      type: "bar",
      borderRadius: 3,
      barThickness: Math.max(2, Math.min(8, 600 / daily.length)),
      yAxisID: "y1",
    },
  ];
});

// (Le cumul des délégués replay a été déplacé sur l'onglet Replay.)

// ─── Filtrage des délégués par MODALITÉ DE PARTICIPATION ───────────────────
// Un délégué est inclus si sa catégorie de participation (parmi les 7
// disjointes de computeParticipation) implique AU MOINS UN mode sélectionné —
// même sémantique que le bloc "Total participants" (CATEGORY_MODES). Alimente
// les cartes géographiques et l'engagement.
const PARTICIPATION_CATEGORIES = [
  "checkedInOnly", "checkedInLive", "checkedInReplay", "checkedInLiveReplay",
  "liveOnly", "both", "replayOnly",
];
const modeMatchedDelegateIds = computed(() => {
  const p = participation.value;
  const ids = new Set();
  for (const cat of PARTICIPATION_CATEGORIES) {
    if (!CATEGORY_MODES[cat].some((m) => selectedModes.value.has(m))) continue;
    for (const id of p[cat] || []) ids.add(id);
  }
  return ids;
});
const participantDelegates = computed(() =>
  pageFilteredDelegates.value.filter((d) => d.id && modeMatchedDelegateIds.value.has(d.id)),
);
// Signature qui change avec les filtres (modalité + population) -> force le
// remount des ChoroplethMap (construites au mount, cf. composant).
const geoCacheKey = computed(
  () => `${[...selectedModes.value].sort().join("-")}-${participantDelegates.value.length}`,
);

// Répartition géographique (par code pays alpha2) des participants filtrés.
const geoCountries = computed(() => {
  const map = {};
  for (const d of participantDelegates.value) {
    const code = d.primaryAddress?.countryCode || d.primaryAddress?.country?.code;
    if (!code) continue;
    map[code] = (map[code] || 0) + 1;
  }
  return Object.entries(map)
    .map(([value, totalCount]) => ({ value, totalCount }))
    .sort((a, b) => b.totalCount - a.totalCount);
});
// Sous-ensemble européen (pour le CSV de la carte Europe ; la carte se recadre
// elle-même sur l'Europe).
const geoCountriesEurope = computed(() =>
  geoCountries.value.filter((c) => COUNTRY_CONTINENTS[(c.value || "").toUpperCase()] === "Europe"),
);

// ─── Engagement : nb de sessions consultées par délégué, empilé par modalité ─
// Présentiel : sessions distinctes scannées en salle / délégué (scansApi audience).
// Live / Replay : sessionsPerUserBuckets déjà calculés (computeLive/ReplayStats).
// Une modalité décochée masque sa série (cohérent avec le filtre page-level).
const BUCKETS = ["1", "2-5", "6-10", "11-15", "16-20", "21-25", "26-30", "30+"];
function bucketOf(n) {
  if (n <= 1) return "1";
  if (n <= 5) return "2-5";
  if (n <= 10) return "6-10";
  if (n <= 15) return "11-15";
  if (n <= 20) return "16-20";
  if (n <= 25) return "21-25";
  if (n <= 30) return "26-30";
  return "30+"; // strictement > 30 (>= 31)
}
// Nombre de sessions UNIQUES consultées par un délégué, tous canaux confondus :
// union dédupliquée des sessionId (présentiel ∪ live ∪ replay), restreinte aux
// modalités sélectionnées. Une même session vue en salle ET en replay compte 1.
function uniqueSessions(r) {
  const s = new Set();
  if (selectedModes.value.has("PHYSIQUE")) for (const id of r.pres) s.add(id);
  if (selectedModes.value.has("LIVE")) for (const id of r.live) s.add(id);
  if (selectedModes.value.has("REPLAY")) for (const id of r.replay) s.add(id);
  return s.size;
}

// Répartition des DÉLÉGUÉS UNIQUES par nombre de sessions UNIQUES consultées.
// Chaque délégué compté 1 seule fois -> hauteur d'une barre = nb de délégués de
// la tranche (réconcilié avec l'export "Détails" : colonnes Sessions uniques /
// Tranche). Pas de découpage par canal.
const engagementByBucket = computed(() => {
  const buckets = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  for (const r of engagementDetail.value) {
    const n = uniqueSessions(r);
    if (n <= 0) continue;
    buckets[bucketOf(n)]++;
  }
  return buckets;
});
const engagementChart = computed(() => {
  const b = engagementByBucket.value;
  return {
    labels: BUCKETS,
    datasets: [{
      label: t("overview.engagement.delegates"),
      data: BUCKETS.map((k) => b[k]),
      backgroundColor: "#1E4E66",
      borderRadius: 4,
    }],
  };
});
const engagementCsvRows = computed(() => {
  const b = engagementByBucket.value;
  return BUCKETS.map((k) => [k, b[k]]);
});

// ─── Participants par jour, ventilés par modalité (suit le filtre de page) ────
// Pour chaque jour : délégués DISTINCTS actifs ce jour-là dans la modalité.
//  - PHYSIQUE : scansApi combined.uniqueDelegatesByDay (tout scan sur place)
//  - LIVE     : liveStats.uniqueByDay (sur sessionEnd = jour de diffusion)
//  - REPLAY   : replayStats.uniqueByDay (sur timestamp = jour de visionnage)
// Pas de dédoublonnage inter-modalité (cohérent avec l'engagement empilé) : une
// même personne active en salle ET en live le même jour compte dans les 2 séries.
const MODE_DAY_COLORS = { PHYSIQUE: "#1E4E66", LIVE: "#30DD92", REPLAY: "#6F45FF" };
const participantsByDayData = computed(() => {
  const phys = props.scansApi?.stats?.value?.combined?.uniqueDelegatesByDay || {};
  const liveArr = liveStats.value?.uniqueByDay || [];
  const replayArr = replayStats.value?.uniqueByDay || [];
  const days = new Set();
  const maps = { PHYSIQUE: {}, LIVE: {}, REPLAY: {} };
  if (selectedModes.value.has("PHYSIQUE"))
    for (const [d, c] of Object.entries(phys)) { maps.PHYSIQUE[d] = c; days.add(d); }
  if (selectedModes.value.has("LIVE"))
    for (const { day, count } of liveArr) { maps.LIVE[day] = count; days.add(day); }
  if (selectedModes.value.has("REPLAY"))
    for (const { day, count } of replayArr) { maps.REPLAY[day] = count; days.add(day); }
  return { days: [...days].sort(), maps };
});
const participantsByDayModes = computed(() =>
  [
    // Libellés courts (Live / Replay sans « distanciel ») pour lever l'ambiguïté
    // avec la décomposition « Total participants » (Live distanciel / Replay distanciel).
    { mode: "PHYSIQUE", label: t("overview.participation.physical") },
    { mode: "LIVE", label: t("overview.datasets.live") },
    { mode: "REPLAY", label: t("overview.datasets.replay") },
  ].filter((s) => selectedModes.value.has(s.mode)),
);
const participantsByDayLabels = computed(() => {
  const days = participantsByDayData.value.days;
  const labelFor = makeDateLabeler(days);
  return days.map(labelFor);
});
// Histogramme GROUPÉ : 1 barre par modalité, groupées par jour.
const participantsByDayDatasets = computed(() => {
  const { days, maps } = participantsByDayData.value;
  if (days.length === 0) return [];
  return participantsByDayModes.value.map((s) => ({
    label: s.label,
    data: days.map((d) => maps[s.mode][d] || 0),
    backgroundColor: MODE_DAY_COLORS[s.mode],
    borderRadius: 4,
  }));
});
const participantsByDayChart = computed(() => ({
  labels: participantsByDayLabels.value,
  datasets: participantsByDayDatasets.value,
}));
const participantsByDayOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: true, position: "bottom" },
    datalabels: { display: false },
  },
  scales: {
    x: { grid: { display: false } },
    y: { beginAtZero: true, ticks: { precision: 0 } },
  },
};
const participantsByDayCsv = computed(() => {
  const { days, maps } = participantsByDayData.value;
  const modes = participantsByDayModes.value;
  return {
    headers: [t("overview.csv.date"), ...modes.map((s) => s.label)],
    rows: days.map((d) => [d, ...modes.map((s) => maps[s.mode][d] || 0)]),
  };
});

// --- Export DÉTAILLÉ par délégué : nb de sessions DISTINCTES consultées en
// présentiel / live / replay. Présentiel = sessions scannées en salle (jointure
// delegateId Mongo). Live/Replay = sessions vues (jointure user_id Keycloak ->
// délégué via buildDelegateLookup). Les viewers ES non rapprochés d'un délégué
// apparaissent avec leur email/nom bruts.
const engagementDetail = computed(() => {
  const lookup = buildDelegateLookup(pageFilteredDelegates.value, { datasetLabel: "overview-engagement" });
  const byId = new Map(pageFilteredDelegates.value.filter((d) => d.id).map((d) => [d.id, d]));
  const rows = new Map();
  const ensure = (delegate, fallbackKey, info = {}) => {
    const key = delegate?.id ? `id:${delegate.id}` : fallbackKey;
    let r = rows.get(key);
    if (!r) {
      r = {
        delegate: delegate || null,
        delegateId: delegate?.id || info.delegateId || "",
        email: delegate?.email || info.email || "",
        fullName: info.fullName || "",
        pres: new Set(), live: new Set(), replay: new Set(),
      };
      rows.set(key, r);
    } else if (delegate && !r.delegate) {
      r.delegate = delegate;
      r.delegateId = delegate.id;
      r.email = delegate.email || r.email;
    }
    return r;
  };
  for (const s of props.scansApi?.stats?.value?.audience?.scans || []) {
    if (!s.delegateId || s.delegateId === "-" || !s.sessionId) continue;
    const r = ensure(byId.get(s.delegateId) || null, `id:${s.delegateId}`, { delegateId: s.delegateId, email: s.email });
    r.pres.add(s.sessionId);
  }
  for (const it of liveStats.value?.items || []) {
    if (!it.userId || !it.sessionId) continue;
    const r = ensure(lookup.get(it.userId)?.delegate || null, `kc:${it.userId}`, { email: it.email, fullName: it.fullName });
    r.live.add(it.sessionId);
  }
  for (const it of replayStats.value?.items || []) {
    if (!it.userId || !it.sessionId) continue;
    const r = ensure(lookup.get(it.userId)?.delegate || null, `kc:${it.userId}`, { email: it.email, fullName: it.fullName });
    r.replay.add(it.sessionId);
  }
  return [...rows.values()];
});
const engagementDetailRows = computed(() =>
  engagementDetail.value
    .map((r) => {
      const d = r.delegate;
      const uniq = uniqueSessions(r);
      return {
        delegateId: r.delegateId,
        nom: d?.familyName || r.fullName || "",
        prenom: d?.givenName || "",
        email: d?.email || r.email || "",
        badge: d ? (delegateBadgeType(d) || "") : "",
        uniq, bucket: bucketOf(uniq),
      };
    })
    .filter((r) => r.uniq > 0)
    .sort((a, b) => b.uniq - a.uniq)
    .map((r) => [r.delegateId, r.nom, r.prenom, r.email, r.badge, r.uniq, r.bucket]),
);

</script>

<style scoped>
.chart-hint {
  font-size: 12px; color: var(--text-muted); font-style: italic;
  margin-left: auto; padding-right: 8px;
}
/* Camembert "Presence par type de session" + legende (indicateur informatif). */
.origin-pie-wrap {
  display: grid; grid-template-columns: 200px 1fr; gap: 16px; align-items: center;
}
.origin-pie { width: 200px; }
.origin-legend { display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
.origin-legend-row {
  display: grid; grid-template-columns: 12px 1fr auto auto;
  align-items: center; gap: 8px;
}
.origin-swatch { width: 12px; height: 12px; border-radius: 3px; }
.origin-name { color: var(--text); }
.origin-legend-row strong { color: var(--text); font-weight: 700; }
.origin-sub { color: var(--text-muted); font-size: 13px; min-width: 50px; text-align: right; }
.origin-legend-row.clickable {
  cursor: pointer; padding: 3px 6px; border-radius: 6px; transition: background .15s;
}
.origin-legend-row.clickable:hover { background: #f3f4f6; }
.origin-legend-row.clickable.active { background: rgba(48,221,146,0.12); }
.origin-legend-row.clickable.active strong { color: #047857; }
.filter-active-bar {
  margin-top: 12px; padding: 8px 12px;
  background: rgba(48,221,146,0.10); border: 1px solid rgba(48,221,146,0.3);
  border-radius: 8px; font-size: 14px; color: var(--text);
  display: flex; align-items: center; gap: 12px;
}
.filter-clear {
  margin-left: auto; padding: 3px 8px;
  background: #fff; border: 1px solid #d1d5db; border-radius: 4px;
  cursor: pointer; font-size: 13px; color: #646464;
}
.filter-clear:hover { background: #f3f4f6; }
@media (max-width: 700px) {
  .origin-pie-wrap { grid-template-columns: 1fr; }
  .origin-pie { width: 160px; margin: 0 auto; }
}
.kpi-overview {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}
.kpi-card-highlight {
  grid-column: span 2;
  min-width: 0;
  box-shadow: 0 4px 16px rgba(48, 221, 146, 0.25), var(--shadow);
  border: 2px solid var(--accent, #30DD92);
}
.kpi-card-highlight .kpi-value { font-size: 37px; }
.kpi-card-highlight .kpi-sub { line-height: 1.5; }

/* Decomposition "Total participants" */
.participation-card { margin-top: 16px; }

/* Filtre "Modalité de participation" (pills PHYSIQUE / LIVE / REPLAY) */
.mode-filter { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 2px 0 14px; }
/* Version page-level : barre/carte en tete de la Vue d'ensemble, pilote la
   decomposition participants + les cartes geo + l'engagement. */
.page-mode-filter {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 10px 16px; margin-bottom: 16px;
  background: var(--card); border-radius: 10px; box-shadow: var(--shadow);
}
.mode-filter-label {
  font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px;
  color: var(--text-muted); margin-right: 2px;
}
.mode-pill {
  font: inherit; font-size: 12px; font-weight: 700; letter-spacing: .3px;
  padding: 4px 10px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--border); background: #fff; color: var(--text-muted);
  transition: all .12s;
}
.mode-pill:hover { border-color: var(--primary); color: var(--primary); }
.mode-pill.on {
  background: var(--primary); border-color: var(--primary); color: #fff;
}
/* 3 grands modes : cartes regroupant les sous-categories */
.participation-modes {
  display: flex;
  align-items: stretch;
  gap: 8px;
  flex-wrap: wrap;
  margin: 18px 0 22px;
}
.mode-card {
  flex: 1 1 0;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #f7f7f9;
  border-top: 4px solid #ccc;
}
.mode-physique { border-top-color: #16a36a; }
.mode-live     { border-top-color: #2A6A8A; }
.mode-replay   { border-top-color: #6F45FF; }
.mode-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 8px;
}
.mode-title {
  flex: 1 1 100%;
  font-size: 13px; color: var(--text-muted); text-transform: uppercase;
  letter-spacing: .4px; font-weight: 700;
}
.mode-total { font-size: 30px; font-weight: 700; color: #254f65; line-height: 1; }
.mode-pct { font-size: 15px; font-weight: 600; color: var(--text-muted, #888); }
.mode-subs {
  display: flex; flex-direction: column; gap: 4px;
  border-top: 1px dashed #e2e2e6; padding-top: 8px; margin-top: auto;
}
.mode-sub { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--text-secondary, #555); }
.sub-swatch { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
.sub-label { flex: 1; }
.sub-value { font-weight: 700; color: var(--text, #414141); font-variant-numeric: tabular-nums; }
.mode-total-card {
  flex: 1 1 0; min-width: 150px;
  display: flex; flex-direction: column; gap: 6px; justify-content: center;
  padding: 12px 14px; border-radius: 10px;
  background: linear-gradient(135deg, rgba(48,221,146,0.14), rgba(111,69,255,0.14));
  border: 2px solid var(--accent, #30DD92);
}
.mode-total-card .mode-title { flex: 0 0 auto; }
.mode-total-big { font-size: 35px; }
.sub-swatch.seg-checkin-only { background: #30DD92; }
.sub-swatch.seg-checkin-live { background: #16a36a; }
.sub-swatch.seg-checkin-replay { background: #0b6b48; }
.sub-swatch.seg-checkin-livereplay { background: #094f37; }
.sub-swatch.seg-live-only   { background: #1E4E66; }
.sub-swatch.seg-both        { background: #2A6A8A; }
.sub-swatch.seg-replay-only { background: #6F45FF; }
.formula-delta {
  display: inline-block;
  margin-top: 6px;
  font-size: 12px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 10px;
  white-space: nowrap;
  align-self: flex-start;
}
.formula-delta.delta--good { color: #047857; background: #d1fae5; }
.formula-delta.delta--bad { color: #b91c1c; background: #fee2e2; }
.formula-delta.delta--neutral { color: var(--text-muted, #888); background: #f3f4f6; }

.formula-op {
  align-self: center;
  font-size: 25px;
  font-weight: 700;
  color: var(--text-muted, #999);
}

/* Ligne = track (barre mise a l'echelle) + total absolu a droite. */
.participation-bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.participation-bar-track { flex: 1; min-width: 0; }
.participation-bar-total {
  flex-shrink: 0;
  min-width: 44px;
  text-align: right;
  font-size: 17px;
  font-weight: 700;
  color: var(--text, #414141);
  font-variant-numeric: tabular-nums;
}
.participation-bar {
  display: flex;
  width: 100%;
  height: 44px;
  border-radius: 8px;
  overflow: hidden;
  background: #f0f0f0;
  gap: 4px; /* separe visuellement les 3 zones (modes) */
}
.participation-bar-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted, #888);
  margin: 0 0 4px;
  text-transform: uppercase;
  letter-spacing: .3px;
}
/* Zone = 1 grand mode (physique / live / replay), subdivisee en sous-segments. */
.bar-zone {
  display: flex;
  height: 100%;
  transition: width 0.4s ease;
  border-radius: 3px;
  overflow: hidden;
}
.bar-segment {
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 15px;
  font-weight: 600;
  transition: width 0.4s ease;
  overflow: hidden;
  white-space: nowrap;
}
.bar-segment.seg-checkin-only { background: #30DD92; color: #0c3a23; }
.bar-segment.seg-checkin-live { background: #16a36a; }
.bar-segment.seg-checkin-replay { background: #0b6b48; }
.bar-segment.seg-checkin-livereplay { background: #094f37; }
.bar-segment.seg-live-only   { background: #1E4E66; }
.bar-segment.seg-both        { background: #2A6A8A; }
.bar-segment.seg-replay-only { background: #6F45FF; }

.participation-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 28px;
  font-size: 14px;
  color: var(--text, #414141);
  margin-bottom: 8px;
}
.legend-mode { display: flex; flex-direction: column; gap: 2px; }
.legend-mode-head { display: inline-flex; align-items: center; gap: 7px; font-weight: 500; }
.swatch-pair { display: inline-flex; gap: 2px; }
.swatch-pair .swatch {
  width: 11px; height: 11px; border-radius: 3px; display: inline-block;
}
.legend-mode-subs { font-size: 12px; color: var(--text-muted, #999); padding-left: 30px; }
.swatch.seg-checkin-only { background: #30DD92; }
.swatch.seg-checkin-live { background: #16a36a; }
.swatch.seg-checkin-replay { background: #0b6b48; }
.swatch.seg-checkin-livereplay { background: #094f37; }
.swatch.seg-live-only   { background: #1E4E66; }
.swatch.seg-both        { background: #2A6A8A; }
.swatch.seg-replay-only { background: #6F45FF; }

.participation-note {
  font-size: 13px;
  color: var(--text-muted, #888);
  font-style: italic;
  margin: 4px 0 0;
  line-height: 1.5;
}
.kpi-card-status {
  grid-column: span 2; min-width: 0;
  background: var(--card); border-radius: 10px; padding: 14px 16px;
  box-shadow: var(--shadow);
}
.kpi-card-status .kpi-label { font-size: 16px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; font-weight: 600; }
.status-row { display: flex; align-items: center; gap: 10px; }
.legend-col { display: flex; flex-direction: column; gap: 3px; }
.legend-col .legend-pill { font-size: 12px; }
</style>
