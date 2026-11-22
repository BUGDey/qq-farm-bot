/** Shared ranch navigation contract. Internal tools belong inside their parent page. */
export const ranchMenu = [
  { path: '/ranch', label: '概览', icon: 'i-carbon-chart-pie' },
  { path: '/ranch/personal', label: '个人', icon: 'i-carbon-user' },
  { path: '/ranch/friends', label: '好友', icon: 'i-carbon-user-multiple' },
  { path: '/activity', label: '活动', icon: 'i-carbon-gift' },
  { path: '/ranch/shop', label: '商城', icon: 'i-carbon-shopping-cart' },
  { path: '/ranking', label: '牧场排行', icon: 'i-carbon-trophy' },
  { path: '/ranch/illustrated', label: '图鉴', icon: 'i-carbon-book' },
  { path: '/ranch/analytics', label: '分析', icon: 'i-carbon-analytics' },
  { path: '/settings', label: '设置', icon: 'i-carbon-settings' },
]

export function ranchSection(section: string, tab: string): string {
  if (section === 'personal')
    return tab === 'buildings' ? 'buildings' : 'warehouse'
  if (section === 'overview')
    return tab === 'orders' ? 'orders' : 'overview'
  return section
}
