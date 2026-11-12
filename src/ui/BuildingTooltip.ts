import { PlacedBuilding } from '../types/building';
import { PedestrianManager } from '../simulation/PedestrianManager';

/**
 * 建築懸停資訊卡片渲染元件 (BuildingTooltip)
 * 抽離原本耦合於 BuildingManager 的 HTML Tooltip 拼裝邏輯
 */
export class BuildingTooltip {
  private element: HTMLDivElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.id = 'building-hover-tooltip';
    this.element.style.cssText = `
      position: absolute;
      display: none;
      pointer-events: none;
      z-index: 1000;
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 8px;
      padding: 10px 14px;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      min-width: 190px;
    `;
    document.body.appendChild(this.element);
  }

  public showAt(
    clientX: number,
    clientY: number,
    building: PlacedBuilding,
    pedestrianManager: PedestrianManager,
    buildings?: Map<string, PlacedBuilding>
  ): void {
    this.element.style.display = 'block';
    this.element.style.left = `${clientX + 14}px`;
    this.element.style.top = `${clientY + 14}px`;
    this.updateContent(building, pedestrianManager, buildings);
  }

  public hide(): void {
    this.element.style.display = 'none';
  }

  public updateContent(
    b: PlacedBuilding,
    pedestrianManager: PedestrianManager,
    buildings?: Map<string, PlacedBuilding>
  ): void {
    const meta = b.metadata;

    if (b.status === 'constructing') {
      const percent = Math.min(100, Math.floor(b.constructionProgress * 100));
      const remaining = Math.max(0, b.constructionDuration * (1.0 - b.constructionProgress));

      this.element.innerHTML = `
        <div style="font-weight: bold; font-size: 13px; color: #fbbf24; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
          <span>🏗️</span> ${meta.name} (建造中 · 吊臂作業中)
        </div>
        <div style="margin: 6px 0;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #cbd5e1; margin-bottom: 3px;">
            <span>建造進度</span>
            <span>${percent}%</span>
          </div>
          <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
            <div style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #f59e0b, #38bdf8); border-radius: 3px;"></div>
          </div>
        </div>
        <div style="font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between;">
          <span>預計工期剩餘:</span>
          <span style="color: #f1f5f9;">約 ${Math.round(remaining * 6)} 遊戲分鐘 (${(remaining / 10).toFixed(1)} 遊戲小時)</span>
        </div>
        <div style="font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; margin-top: 2px;">
          <span>規劃入住人數:</span>
          <span style="color: #4ade80;">${b.registeredResidents} 人 (房型上限 ${meta.capacity}人)</span>
        </div>
      `;
      return;
    }

    if (meta.category === 'Industrial_Low') {
      const ind = b.industrialProfile;
      const employedCount = ind ? ind.workerCount : (b.employedWorkerIds ? b.employedWorkerIds.length : 0);
      const currentInside = ind ? ind.insideWorkerCount : b.currentOccupants;
      const maxWorkers = ind ? ind.maxWorkers : meta.capacity;
      const statusColor = employedCount > 0 ? '#4ade80' : '#fbbf24';
      const statusText = employedCount >= maxWorkers ? '已額滿運轉中' : (employedCount > 0 ? '招募中·運轉中' : '缺工招募中');

      this.element.innerHTML = `
        <div style="font-weight: bold; font-size: 13px; color: #fbbf24; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
          <span>🏭 ${meta.name}</span>
          <span style="font-size: 10px; color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.4); padding: 1px 5px; border-radius: 4px;">工業(${ind?.density ?? 'Low'}) · ${ind?.state ?? 'Idle'}</span>
        </div>
        <div style="font-size: 11.5px; color: #94a3b8; margin-bottom: 6px;">
          ${meta.description}
        </div>
        <div style="background: rgba(15, 23, 42, 0.55); border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; border: 1px solid rgba(255,255,255,0.06); font-size: 11px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span style="color: #cbd5e1;">💰 工廠資金:</span>
            <span style="color: #4ade80; font-weight: bold;">$${(ind?.funds ?? 0).toLocaleString()}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span style="color: #cbd5e1;">📦 原物料 (${ind?.rawMaterialType ?? '未指定'}):</span>
            <span style="color: #f1f5f9;">${ind?.rawMaterialAmount ?? 0}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span style="color: #cbd5e1;">🏭 產品 (${ind?.productType ?? '未指定'}):</span>
            <span style="color: #f1f5f9;">${ind?.productAmount ?? 0}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span style="color: #cbd5e1;">💼 員工數 / 最大員工數:</span>
            <span style="color: #38bdf8; font-weight: bold;">${employedCount} / ${maxWorkers} 人</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span style="color: #cbd5e1;">👥 工廠內員工數:</span>
            <span style="color: #4ade80; font-weight: bold;">${currentInside} 人</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #cbd5e1;">🚚 工廠內貨車數:</span>
            <span style="color: #fbbf24; font-weight: bold;">${ind?.insideTruckCount ?? 1} 輛</span>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8;">
          <span>建築佔地規格:</span>
          <span style="color: #f1f5f9;">面寬 ${meta.frontageWidth} 格 × 縱深 ${meta.lotDepth} 格 (${(meta.frontageWidth * 0.5).toFixed(1)}m × ${(meta.lotDepth * 0.5).toFixed(1)}m)</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; margin-top: 2px;">
          <span>運營狀態:</span>
          <span style="color: ${statusColor};">● ${statusText}</span>
        </div>
      `;
      return;
    }

    const coLivingText = b.isCoLiving ? '🤝 與人合居' : '👤 獨立自住';
    const resState = b.residentialProfile?.state;
    const moveInBadge = b.currentOccupants > 0 || resState === 'Active'
      ? '<span style="color: #4ade80;">● 已入住</span>'
      : (resState === 'WaitingForRoad'
          ? '<span style="color: #ef4444;">⚠️ 等待聯外道路</span>'
          : '<span style="color: #38bdf8;">🚗 遷入中...</span>');

    let vehiclesHtml = '';
    if (b.vehicles && b.vehicles.length > 0) {
      const listVehicles = b.vehicles.map((v, idx) => {
        const statusText = v.status === 'available'
          ? '<span style="color: #4ade80;">● 閒置可用</span>'
          : (v.status === 'in_use'
              ? `<span style="color: #fbbf24;">🚗 出行中 (${v.currentDriverName || '市民'})</span>`
              : '<span style="color: #38bdf8;">🚚 遷入中</span>');
        return `
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 2px;">
            <span style="color: #cbd5e1;">🚗 #${idx + 1} [${v.sourceLabel} · ${v.colorName}]</span>
            <span>${statusText}</span>
          </div>
        `;
      }).join('');

      vehiclesHtml = `
        <div style="margin-top: 6px; padding-top: 5px; border-top: 1px solid rgba(255,255,255,0.08);">
          <div style="color: #38bdf8; font-weight: bold; font-size: 11px; margin-bottom: 3px; display: flex; justify-content: space-between;">
            <span>🚗 住宅名下車輛:</span>
            <span style="color: #f1f5f9; font-weight: normal;">共 ${b.vehicles.length} 輛</span>
          </div>
          ${listVehicles}
        </div>
      `;
    }

    let residentsHtml = '';
    if (b.residents && b.residents.length > 0) {
      const listItems = b.residents.map((r) => {
        const icon = r.gender === 'male' ? '👨' : '👩';
        const genderText = r.gender === 'male' ? '男' : '女';
        const prefText = r.transitPreference === 'DriveOnly'
          ? '偏好開車'
          : (r.transitPreference === 'WalkIfClose' ? '短途步行' : '大眾運輸');
        let actText = '<span style="color: #4ade80;">在家</span>';
        if (!r.atHome || r.currentActivity !== 'AtHome') {
          if (r.currentActivity === 'MovingIn') {
            const activePed = pedestrianManager.findActivePedestrianByCitizenId(r.id);
            actText = activePed && !activePed.isAlighted
              ? '<span style="color: #38bdf8;">🚗 車內準備下車</span>'
              : '<span style="color: #38bdf8;">🚶 遷入進屋中</span>';
          } else if (r.currentActivity === 'AtWork') {
            actText = '<span style="color: #fbbf24;">🏭 工廠上班中</span>';
          } else if (r.currentTravelMode === 'drive') {
            const activePed = pedestrianManager.findActivePedestrianByCitizenId(r.id);
            if (activePed) {
              if (activePed.isWaitingLight) {
                actText = '<span style="color: #ef4444; font-weight: bold;">🚦 停等紅綠燈 (走向車輛)</span>';
              } else if (activePed.isCrossingCrosswalk) {
                actText = '<span style="color: #38bdf8; font-weight: bold;">🚸 穿越斑馬線 (走向車輛)</span>';
              } else {
                actText = '<span style="color: #4ade80;">🚶 走向車輛中</span>';
              }
            } else {
              actText = '<span style="color: #fbbf24;">開車出行</span>';
            }
          } else {
            const activePed = pedestrianManager.findActivePedestrianByCitizenId(r.id);
            if (activePed?.isWaitingLight) {
              actText = '<span style="color: #ef4444; font-weight: bold;">🚶 停等紅綠燈</span>';
            } else if (activePed?.isCrossingCrosswalk) {
              actText = '<span style="color: #38bdf8; font-weight: bold;">🚸 穿越斑馬線</span>';
            } else {
              actText = '<span style="color: #38bdf8;">步行通勤</span>';
            }
          }
        }
        const workPlaceName = r.workBuildingId && buildings
          ? (buildings.get(r.workBuildingId)?.metadata.name ?? r.workBuildingId)
          : undefined;
        const hasPendingJobTask = r.taskQueue?.some((t) => t.type === 'FIND_JOB') ?? false;
        const jobBadge = r.workBuildingId
          ? `<span style="color: #4ade80;">💼 ${workPlaceName ?? '已就職'}</span>`
          : (r.age < 18
              ? '<span style="color: #64748b;">🎒 未成年</span>'
              : (hasPendingJobTask
                  ? '<span style="color: #fbbf24;">⏳ 找工作中</span>'
                  : '<span style="color: #94a3b8;">🔍 待業</span>'));

        return `
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 2px;">
            <span style="color: #f1f5f9;">${icon} ${r.name} <span style="font-size: 10px; color: #64748b;">(${prefText})</span></span>
            <span>${actText} · ${jobBadge} · <span style="color: #94a3b8;">${genderText} ${r.age}歲</span></span>
          </div>
        `;
      }).join('');

      residentsHtml = `
        <div style="margin-top: 6px; padding-top: 5px; border-top: 1px solid rgba(255,255,255,0.08);">
          <div style="color: #38bdf8; font-weight: bold; font-size: 11px; margin-bottom: 3px;">👥 入住市民個資:</div>
          ${listItems}
        </div>
      `;
    }

    this.element.innerHTML = `
      <div style="font-weight: bold; font-size: 13px; color: #38bdf8; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
        <span>🏠 ${meta.name}</span>
        ${moveInBadge}
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
        <span style="color: #94a3b8;">總登記居住者:</span>
        <span style="color: #fbbf24; font-weight: bold;">${b.registeredResidents} 人 <span style="font-size: 10px; color: #64748b;">(上限 ${meta.capacity}人)</span></span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
        <span style="color: #94a3b8;">現房內人數:</span>
        <span style="color: #4ade80; font-weight: bold;">${b.currentOccupants} 人</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
        <span style="color: #94a3b8;">居住模式:</span>
        <span style="color: #cbd5e1;">${coLivingText}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
        <span style="color: #94a3b8;">建築佔地規格:</span>
        <span style="color: #f1f5f9;">面寬 ${meta.frontageWidth} 格 × 縱深 ${meta.lotDepth} 格</span>
      </div>
      <div style="font-size: 11px; color: #94a3b8; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 4px;">
        ${meta.description}
      </div>
      ${vehiclesHtml}
      ${residentsHtml}
    `;
  }
}
