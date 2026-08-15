import './desktop-product.css'
import { isTauri } from './desktop'

function productizeBackstage(): boolean {
  const panel = document.querySelector<HTMLElement>('#nivaBackstage')
  if (!panel || panel.dataset.productized === 'true') return !!panel
  panel.dataset.productized = 'true'
  panel.classList.add('niva-product-settings')

  const title = panel.querySelector<HTMLElement>('.backstage-head b')
  const subtitle = panel.querySelector<HTMLElement>('.backstage-head span')
  if (title) title.textContent = 'NIVA 设置'
  if (subtitle) subtitle.textContent = '日常互动、声音与记忆'

  const interaction = panel.querySelector<HTMLSelectElement>('#interactionMode')
  const voiceOutput = panel.querySelector<HTMLInputElement>('#voiceOutput')
  const interactionLabel = interaction?.closest('label')
  const voiceLabel = voiceOutput?.closest('label')
  interactionLabel?.querySelector('span')?.replaceChildren('和 NIVA 交流')
  voiceLabel?.querySelector('span')?.replaceChildren('让 NIVA 说话')

  const grid = panel.querySelector<HTMLElement>('.backstage-grid')
  if (grid) {
    const intro = document.createElement('section')
    intro.className = 'product-settings-intro'
    intro.innerHTML = `
      <strong>她会保留少量重要记忆</strong>
      <span>近期聊天和长期记忆分开保存，你可以随时单独清除。</span>
    `
    grid.before(intro)
  }

  const modelSelect = panel.querySelector<HTMLSelectElement>('#deepseekModel')
  const apiKey = panel.querySelector<HTMLInputElement>('#deepseekKey')
  const activeModel = panel.querySelector<HTMLSelectElement>('#activeModel')
  const modelLabel = modelSelect?.closest('label')
  const apiLabel = apiKey?.closest('label')
  const activeModelLabel = activeModel?.closest('label')

  modelLabel?.querySelector('span')?.replaceChildren('AI 模型')
  apiLabel?.querySelector('span')?.replaceChildren('DeepSeek API Key')
  activeModelLabel?.querySelector('span')?.replaceChildren('角色模型')

  const advanced = document.createElement('details')
  advanced.className = 'product-advanced'
  advanced.innerHTML = `
    <summary><span>开发者设置</span><small>测试版 / BYOK</small></summary>
    <div class="product-advanced-note">正式消费版会隐藏这些技术配置。当前测试版仍保留 API 与模型入口，方便继续研发。</div>
    <div class="product-advanced-grid"></div>
    <div class="product-advanced-actions"></div>
  `

  const advancedGrid = advanced.querySelector<HTMLElement>('.product-advanced-grid')!
  for (const label of [modelLabel, apiLabel, activeModelLabel]) {
    if (label) advancedGrid.appendChild(label)
  }

  const actions = panel.querySelector<HTMLElement>('.backstage-actions')
  const chooseModel = panel.querySelector<HTMLButtonElement>('#chooseLocalModel')
  const resetLearned = panel.querySelector<HTMLButtonElement>('#resetLearned')
  const advancedActions = advanced.querySelector<HTMLElement>('.product-advanced-actions')!
  if (chooseModel) {
    chooseModel.textContent = '导入测试 VRM'
    advancedActions.appendChild(chooseModel)
  }
  if (resetLearned) {
    resetLearned.textContent = '清空测试动作'
    advancedActions.appendChild(resetLearned)
  }

  if (grid) grid.after(advanced)
  else actions?.before(advanced)

  const clearRecent = panel.querySelector<HTMLButtonElement>('#clearConversation')
  const clearLongTerm = panel.querySelector<HTMLButtonElement>('#clearLongTermMemory')
  const save = panel.querySelector<HTMLButtonElement>('#saveBackstage')
  if (clearRecent) clearRecent.textContent = '忘掉最近聊天'
  if (clearLongTerm) clearLongTerm.textContent = '清除长期记忆'
  if (save) save.textContent = '完成'

  // During the BYOK development phase a brand-new install still needs an API key.
  // Open the technical section only in that case; returning users see the simple UI.
  if (apiKey && !apiKey.placeholder.includes('已保存')) advanced.open = true

  return true
}

function bootProductLayer() {
  if (!isTauri()) return
  if (productizeBackstage()) return

  const observer = new MutationObserver(() => {
    if (!productizeBackstage()) return
    observer.disconnect()
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  window.setTimeout(() => observer.disconnect(), 10000)
}

bootProductLayer()
