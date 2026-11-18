<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import RanchActivity from './Activity.vue'
import RanchAnalytics from './RanchAnalytics.vue'
import RanchDashboard from './RanchDashboard.vue'
import RanchFriends from './RanchFriends.vue'
import RanchIllustrated from './RanchIllustrated.vue'
import RanchPersonal from './RanchPersonal.vue'
import RanchShop from './RanchShop.vue'

const route = useRoute()
const component = computed(() => ({ overview: RanchDashboard, personal: RanchPersonal, friends: RanchFriends, activity: RanchActivity, shop: RanchShop, illustrated: RanchIllustrated, analytics: RanchAnalytics }[String(!route.params.section && route.query.view === 'orders' ? 'personal' : route.params.section || 'overview')] || RanchDashboard))
</script>

<template>
  <component :is="component" />
</template>
