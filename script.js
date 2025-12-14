let map;
// 儲存所有已載入的 GPX 軌跡資訊
const allGpxTracks = {};
let gpxIdCounter = 0;

// 全域控制變數
let globalMarkerMode = "distance"; // 預設為每公里標記
let globalColorMode = "unique";   // 預設為路線獨立顏色
const UNIFIED_COLOR = "#8A2BE2";  // 統一顏色 (藍紫色)

const MAX_HUMAN_SPEED_KMH = 20,
    MAX_TIME_GAP_HOURS = .3,
    DISTANCE_INTERVAL_KM = 1.0; // 每 1 公里標記一次

// --- 輔助函數 (保留) ---

function haversineDistance(e, t, a, n) {
    var o = (a - e) * (Math.PI / 180),
        n = (n - t) * (Math.PI / 180),
        t = Math.sin(o / 2) * Math.sin(o / 2) + Math.cos(e * (Math.PI / 180)) * Math.cos(a * (Math.PI / 180)) * Math.sin(n / 2) * Math.sin(n / 2);
    return 6371 * (2 * Math.atan2(Math.sqrt(t), Math.sqrt(1 - t)))
}

function haversineDistance3D(e, t, a, n, o, r) {
    e = haversineDistance(e, t, n, o), t = (r - a) / 1e3;
    return Math.sqrt(e * e + t * t)
}

function formatMinutesToHMS(e) {
    var t, a, n;
    return null === e || e < 0 ? "0:00:00" : (e = Math.round(60 * e), t = Math.floor(e / 3600), a = Math.floor(e % 3600 / 60), e = e % 60, `${(n=e=>e.toString().padStart(2,"0"))(t)}:${n(a)}:` + n(e))
}

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// --- GPX 解析函數 (保留) ---

function processGpxFile(e) {
    // ... (保持不變) ...
    e = (new DOMParser).parseFromString(e, "text/xml");
    const i = [];
    e.querySelectorAll("trkpt, rtept, wpt").forEach(e => {
        var t = parseFloat(e.getAttribute("lat")),
            a = parseFloat(e.getAttribute("lon")),
            n = e.querySelector("time"),
            e = e.querySelector("ele");
        let o = null,
            r = null;
        n && (r = n.textContent, o = new Date(r).getTime());
        n = e ? parseFloat(e.textContent) : void 0;
        isNaN(t) || isNaN(a) || !o || i.push({
            lat: t,
            lon: a,
            timeMs: o,
            timeString: r,
            ele: n
        })
    });
    if (0 === i.length) return [];
    const l = [];
    let s = 0,
        d = 0;
    let c = i[0].timeMs,
        p = null;
    return i.forEach((e, t) => {
        let a = 0,
            n = 0,
            o = 0,
            r = 0;
        p && (a = (e.timeMs - p.timeMs) / 6e4, n = haversineDistance(p.lat, p.lon, e.lat, e.lon), s += n, void 0 !== e.ele && void 0 !== p.ele ? (o = haversineDistance3D(p.lat, p.lon, p.ele, e.lat, e.lon, e.ele), d += o, r = e.ele - p.ele) : (o = n, d += o));
        var i = (e.timeMs - c) / 6e4;
        l.push({
            lat: e.lat,
            lon: e.lon,
            timeMs: e.timeMs,
            timeString: e.timeString,
            elevation: e.ele,
            timeElapsed: a,
            distance2DSinceLast: n,
            distance3DSinceLast: o,
            totalTime: i,
            totalDistance2D: s,
            totalDistance3D: d,
            elevationChange: r
        }), p = e
    }), l
}

/**
 * 將分鐘數轉換為 [分:秒] 的配速格式 (例如 5.5 min/km -> 5:30)
 * @param {number} distanceKm - 距離 (公里)
 * @param {number} timeMinutes - 時間 (分鐘)
 * @returns {string} 配速字串 (M:SS)
 */

function calculatePace(distanceKm, timeMinutes) {
    if (distanceKm <= 0 || timeMinutes < 0) return "0:00";
    
    // 計算配速 (分鐘/公里)
    const paceMinutesPerKm = timeMinutes / distanceKm;
    
    // 取整數分鐘部分
    const minutes = Math.floor(paceMinutesPerKm);
    
    // 計算秒數部分
    const seconds = Math.round((paceMinutesPerKm - minutes) * 60);
    
    // 處理秒數進位
    if (seconds === 60) {
        return `${minutes + 1}:00`;
    }
    
    const formattedSeconds = seconds.toString().padStart(2, '0');
    return `${minutes}:${formattedSeconds}`;
}




// --- 標記點邏輯 (保持不變) ---

function getDistanceMarkers(t) {
    var a = [];
    if (0 !== t.length) {
        a.push({ ...t[0],
            markerType: "Start",
            segmentPace: "N/A",
            segmentDistance: 0
        });
        let nextMarkerDistance = DISTANCE_INTERVAL_KM;
        let lastMarkerPoint = t[0];

        for (let e = 1; e < t.length - 1; e++) {
            const current = t[e];
            const next = t[e + 1];

            if (current.totalDistance3D >= nextMarkerDistance && next.totalDistance3D > current.totalDistance3D) {
                // 找到一個新的公里標記點
                
                // 計算分段數據
                const segmentTimeMinutes = (current.timeMs - lastMarkerPoint.timeMs) / 6e4;
                const segmentDistanceKm = current.totalDistance3D - lastMarkerPoint.totalDistance3D;
                const segmentPace = calculatePace(segmentDistanceKm, segmentTimeMinutes);

                a.push({ 
                    ...current,
                    markerType: "Distance",
                    segmentPace: segmentPace, // 過去一公里的配速
                    segmentDistance: nextMarkerDistance // 累計公里數標記
                });
                
                // 更新下一個標記點的目標距離和起點
                nextMarkerDistance += DISTANCE_INTERVAL_KM;
                lastMarkerPoint = current; 
            }
        }

        var e = t[t.length - 1];
        if (a.length === 0 || a[a.length - 1].timeMs !== e.timeMs) {
            // 處理終點
            const totalDistanceKm = e.totalDistance3D;
            const totalTimeMinutes = e.totalTime;
            const avgPace = calculatePace(totalDistanceKm, totalTimeMinutes);

            a.push({ 
                ...e,
                markerType: "End",
                segmentPace: avgPace, // 終點顯示整體平均配速
                segmentDistance: totalDistanceKm
            });
        }
    }
    return a;
}

function getHourlyMarkers(r) {
    // 保持不變
    var e = [];
    if (0 !== r.length) {
        var t = r[0].timeMs,
            i = r[r.length - 1].timeMs,
            t = new Date(t);
        t.setUTCFullYear(t.getUTCFullYear()), t.setUTCMonth(t.getUTCMonth()), t.setUTCDate(t.getUTCDate()), t.setUTCHours(t.getUTCHours()), t.setUTCMinutes(0, 0, 0), t.setUTCHours(t.getUTCHours() + 1);
        let n = t.getTime(),
            o = (e.push({ ...r[0],
                markerType: "Start"
            }), 0);
        for (; n < i;) {
            let t = null,
                a = 1 / 0;
            for (let e = o; e < r.length; e++) {
                var l = r[e];
                if (l.timeMs > n + 18e5) {
                    o = e;
                    break
                }
                var s = Math.abs(l.timeMs - n);
                s <= 18e5 && s < a && (a = s, t = l)
            }
            if (t && !e.some(e => e.timeMs === t.timeMs) && e.push({ ...t,
                    markerType: "Hourly"
                }), (n += 36e5) > i + 72e5) break
        }
        const a = r[r.length - 1];
        e.some(e => e.timeMs === a.timeMs) || e.push({ ...a,
            markerType: "End"
        })
    }
    return e
}

function getTrackMarkers(trackId, mode) {
    const track = allGpxTracks[trackId];
    if (!track || mode === 'none') return [];

    switch (mode) {
        case 'distance':
            return getDistanceMarkers(track.rawPoints);
        case 'hourly':
            return getHourlyMarkers(track.rawPoints);
        default:
            return []; // 'none' 或其他無效模式
    }
}

// --- 繪製與管理多軌跡 (保持不變) ---

// --- 繪製與管理多軌跡 ---

function renderGpxTracks() {
    let allCoords = [];
    const trackList = document.getElementById("gpxTrackList");
    trackList.innerHTML = ''; // 清空列表

    Object.keys(allGpxTracks).forEach(id => {
        const track = allGpxTracks[id];

        // 1. 決定軌跡顏色
        const trackColor = globalColorMode === 'unified' ? UNIFIED_COLOR : track.color;

        // 2. 移除舊圖層 (如果有)
        if (track.leafletLayer && map.hasLayer(track.leafletLayer)) {
            map.removeLayer(track.leafletLayer);
        }

        // 3. 建立新的 Leaflet 圖層
        track.leafletLayer = L.layerGroup();

        // 4. 只有在 isVisible 為 true 時才繪製
        if (track.isVisible) {
            const r = []; // 儲存線段座標陣列
            let o = []; // 儲存單一線段的座標點
            track.rawPoints.forEach((t, a) => {
                if (0 === a) o.push([t.lat, t.lon]);
                else {
                    var a = t.distance2DSinceLast,
                        n = t.timeElapsed / 60;
                    let e = !0;
                    // 檢查斷點條件
                    n > MAX_TIME_GAP_HOURS ? e = !1 : 0 < n ? a / n > MAX_HUMAN_SPEED_KMH && (e = !1) : .5 < a && (e = !1),
                        e ? o.push([t.lat, t.lon]) : (1 < o.length && r.push(o), o = [
                            [t.lat, t.lon]
                        ])
                }
            });
            1 < o.length && r.push(o); // 儲存最後一段線段

            r.forEach(e => {
                L.polyline(e, {
                    color: trackColor, // 使用 trackColor
                    weight: 4,
                    opacity: .8,
                    name: track.name
                }).addTo(track.leafletLayer);
                allCoords.push(...e); // 收集所有顯示軌跡的座標
            });

            // 繪製標記點 (根據全域模式)
            getTrackMarkers(id, globalMarkerMode).forEach(e => {
                var t = e.timeMs ? new Date(e.timeMs) : null,
                    t = t ? t.toLocaleString() : "時間未知",
                    a = void 0 !== e.elevation ? `海拔:${e.elevation.toFixed(1)}m` : "";

                let popupContent = `<strong>${track.name}</strong><br>時間:${t}<br>${a}<br>GPS:${e.lat.toFixed(5)},${e.lon.toFixed(5)}`;
                
                // 核心變動：根據模式顯示配速與公里數
                if (globalMarkerMode === 'distance' && e.segmentPace) {
                    if (e.markerType === 'Distance') {
                        popupContent = `
                            <strong>${track.name} (第 ${e.segmentDistance.toFixed(0)} 公里)</strong><br>
                            模式: 每公里標記<br>
                            **過去 1 公里配速:** <span style="font-weight: bold; color: green; font-size: 1.1em;">${e.segmentPace} /km</span><br>
                            時間:${t}<br>${a}<br>
                            GPS:${e.lat.toFixed(5)},${e.lon.toFixed(5)}
                        `;
                    } else if (e.markerType === 'End') {
                        // 終點顯示整體平均配速
                        const overallPace = calculatePace(track.rawPoints[track.rawPoints.length-1].totalDistance3D, track.rawPoints[track.rawPoints.length-1].totalTime);
                        popupContent = `
                            <strong>${track.name} (終點)</strong><br>
                            總距離: ${track.rawPoints[track.rawPoints.length-1].totalDistance3D.toFixed(2)} km<br>
                            **整體平均配速:** <span style="font-weight: bold; color: blue; font-size: 1.1em;">${overallPace} /km</span><br>
                            時間:${t}<br>${a}<br>
                            GPS:${e.lat.toFixed(5)},${e.lon.toFixed(5)}
                        `;
                    }
                } else {
                    // 其他模式或起點/終點的預設顯示
                    let markerTypeText = globalMarkerMode === 'hourly' ? `每小時標記` : e.markerType;
                    popupContent = `
                        <strong>${track.name} (${markerTypeText})</strong><br>
                        時間:${t}<br>${a}<br>
                        GPS:${e.lat.toFixed(5)},${e.lon.toFixed(5)}
                    `;
                }


                L.circleMarker([e.lat, e.lon], {
                    radius: 6,
                    color: trackColor, // 使用 trackColor
                    fillColor: trackColor,
                    fillOpacity: 1,
                    weight: 2
                }).bindPopup(popupContent).addTo(track.leafletLayer)
            });

            track.leafletLayer.addTo(map); // 將新圖層加入地圖
        }

        // 5. 建立側邊欄列表項目
        const listItem = document.createElement("div");
        listItem.className = `gpx-track-item ${track.isVisible ? 'active' : ''}`;
        listItem.setAttribute("data-id", id);
        listItem.style.borderLeftColor = trackColor; // 使用 trackColor 設置左側條

        listItem.innerHTML = `
            <div class="track-main">
                <input type="checkbox" id="gpx-toggle-${id}" ${track.isVisible ? 'checked' : ''}>
                <span class="track-name-display" contenteditable="true" data-id="${id}">
                    ${track.name}
                </span>
                <button class="delete-gpx-track">刪除</button>
            </div>
            <div class="track-info-actions">
                <span>距離: ${(track.rawPoints[track.rawPoints.length-1].totalDistance3D || 0).toFixed(2)} km</span>
                <div class="track-actions">
                    <button class="go-to-start-point" data-id="${id}">查看</button>
                </div>
            </div>
        `;

        // 6. 綁定事件
        listItem.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
            track.isVisible = e.target.checked;
            listItem.classList.toggle('active', track.isVisible);
            renderGpxTracks(); // 重新繪製所有軌跡
        });

        listItem.querySelector('.delete-gpx-track').addEventListener('click', () => {
            if (confirm(`確定要刪除軌跡：${track.name} 嗎？`)) {
                delete allGpxTracks[id];
                renderGpxTracks(); // 重新繪製並更新列表
            }
        });

        listItem.querySelector('.track-name-display').addEventListener('blur', function() {
            const newName = this.textContent.trim();
            if (newName && allGpxTracks[id]) {
                allGpxTracks[id].name = newName;
                renderGpxTracks();
            }
        });

        // 新增「查看」按鈕事件 (配速概覽)
        listItem.querySelector('.go-to-start-point').addEventListener('click', function() {
            const firstPoint = allGpxTracks[id].rawPoints[0];
            if (!firstPoint) return;
            
            // 飛到起點
            map.flyTo([firstPoint.lat, firstPoint.lon], 15, { duration: 1 });
            
            // 產生配速資訊列表
            const distanceMarkers = getDistanceMarkers(allGpxTracks[id].rawPoints);
            
            let paceListHTML = '<div style="max-height: 200px; overflow-y: auto;">';
            let segmentCount = 0;
            
            // 僅顯示分段配速點
            distanceMarkers.forEach(marker => {
                 if (marker.markerType === 'Distance') {
                    segmentCount++;
                    paceListHTML += `<div style="padding: 5px; border-bottom: 1px dotted #ccc;">
                        **第 ${segmentCount} 公里**: <span style="color: green; font-weight: bold;">${marker.segmentPace} /km</span>
                    </div>`;
                }
            });

            const overallPace = calculatePace(
                allGpxTracks[id].rawPoints[allGpxTracks[id].rawPoints.length-1].totalDistance3D, 
                allGpxTracks[id].rawPoints[allGpxTracks[id].rawPoints.length-1].totalTime
            );

            paceListHTML += `</div>`; // 結束滾動區

            const overviewPopup = L.popup()
                .setLatLng([firstPoint.lat, firstPoint.lon])
                .setContent(`
                    <h4>${allGpxTracks[id].name} - 配速概覽</h4>
                    <p style="font-size: 1.1em; font-weight: bold;">總距離: ${allGpxTracks[id].rawPoints[allGpxTracks[id].rawPoints.length-1].totalDistance3D.toFixed(2)} km</p>
                    <p style="font-size: 1.1em; font-weight: bold;">平均配速: <span style="color: blue;">${overallPace} /km</span></p>
                    <hr>
                    ${paceListHTML}
                `)
                .openOn(map);
        });

        trackList.appendChild(listItem);
    });

    // 7. 調整地圖視角以適應所有顯示的軌跡
    if (allCoords.length > 0) {
        map.fitBounds(L.latLngBounds(allCoords), {
            padding: [50, 50]
        });
    }

    // 8. 更新匯出按鈕的可用性
    document.getElementById("exportConsolidatedDataBtn").disabled = Object.keys(allGpxTracks).length === 0;
}


function handleGpxUpload(e) {
    const files = Array.from(e.target.files);
    e.target.value = ""; // 清空檔案選擇器以便再次上傳相同檔案

    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const rawPoints = processGpxFile(event.target.result);

                if (rawPoints.length === 0) {
                    alert(`GPX 檔案 ${file.name} 中未找到有效的軌跡點或時間/海拔資訊。`);
                    return;
                }

                const newId = `gpx-${gpxIdCounter++}`;
                
                // 根據最早的時間點作為預設名稱
                const defaultName = rawPoints[0].timeString ?
                    new Date(rawPoints[0].timeMs).toLocaleDateString('zh-TW', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                    }).replace(/\//g, '-') + ' 紀錄' :
                    file.name.replace(/\.gpx$/i, '').trim();

                const newTrack = {
                    name: defaultName,
                    rawPoints: rawPoints,
                    leafletLayer: null,
                    isVisible: true,
                    color: getRandomColor(), // 儲存獨立顏色，以便在 'unique' 模式下使用
                };

                allGpxTracks[newId] = newTrack;
                renderGpxTracks();

            } catch (error) {
                alert(`❌ GPX 檔案 ${file.name} 解析失敗，請確認格式是否正確。`);
                console.error("GPX 解析錯誤:", error);
            }
        };
        reader.readAsText(file);
    });
}

function handleClearData() {
    if (confirm("確定要清除所有已載入的 GPX 軌跡嗎？")) {
        Object.keys(allGpxTracks).forEach(id => {
            const track = allGpxTracks[id];
            if (track.leafletLayer && map.hasLayer(track.leafletLayer)) {
                map.removeLayer(track.leafletLayer);
            }
        });
        for (const key in allGpxTracks) {
            delete allGpxTracks[key];
        }
        document.getElementById("gpxTrackList").innerHTML = '';
        document.getElementById("exportConsolidatedDataBtn").disabled = true;
        alert("✅ 所有 GPX 軌跡已清除！");
    }
}

// --- 匯出數據 ---

function exportConsolidatedData() {
    const allExportPoints = [];
    // 匯出時如果全域為 'none'，則預設匯出 distance mode 的點
    const mode = globalMarkerMode === 'none' ? 'distance' : globalMarkerMode; 

    Object.keys(allGpxTracks).forEach(id => {
        const track = allGpxTracks[id];
        if (track.isVisible) {
            const points = getTrackMarkers(id, mode); // 根據當前或預設模式獲取點位

            // 如果 getTrackMarkers 在 'none' 模式下返回空，則手動將起點/終點加入，確保有數據
            let pointsToExport = points.length > 0 ? points : [track.rawPoints[0], track.rawPoints[track.rawPoints.length-1]].filter(p => p);


            let accumulatedTimeMs = pointsToExport.length > 0 ? pointsToExport[0].timeMs : 0;
            let accumulatedDistance3D = 0;

            for (let i = 0; i < pointsToExport.length; i++) {
                const current = pointsToExport[i];
                const prev = i > 0 ? pointsToExport[i - 1] : null;

                let timeElapsedMin = 0;
                let distance3DSinceLast = 0;
                let elevationChange = 0;
                let overallPace = "0:00"; // 儲存該點位的累積平均配速

                if (prev) {
                    timeElapsedMin = (current.timeMs - prev.timeMs) / 6e4;
                    
                    if (current.elevation !== undefined && prev.elevation !== undefined) {
                        elevationChange = current.elevation - prev.elevation;
                        const prevEle = prev.elevation !== undefined ? prev.elevation : 0;
                        const currentEle = current.elevation !== undefined ? current.elevation : 0;
                        distance3DSinceLast = haversineDistance3D(prev.lat, prev.lon, prevEle, current.lat, current.lon, currentEle);
                    } else {
                        elevationChange = NaN;
                        distance3DSinceLast = haversineDistance(prev.lat, prev.lon, current.lat, current.lon);
                    }
                    accumulatedTimeMs = current.timeMs; // 使用當前點的時間戳
                    accumulatedDistance3D += distance3DSinceLast;
                }
                
                // 計算整體平均配速 (從軌跡起點到該點)
                const totalTimeMinutes = (current.timeMs - track.rawPoints[0].timeMs) / 6e4;
                const totalDistance3D = current.totalDistance3D;
                overallPace = calculatePace(totalDistance3D, totalTimeMinutes);


                allExportPoints.push({
                    trackName: track.name,
                    type: `GPX(${current.markerType || 'Boundary'})`,
                    timeMs: current.timeMs,
                    time: new Date(current.timeMs).toLocaleString().replace(/,/g, " "),
                    lat: current.lat,
                    lon: current.lon,
                    elevation: void 0 !== current.elevation ? current.elevation.toFixed(2) : "N/A",
                    timeElapsed: formatMinutesToHMS(timeElapsedMin),
                    distance3D: distance3DSinceLast.toFixed(4),
                    elevationChange: !isNaN(elevationChange) ? elevationChange.toFixed(2) : "N/A",
                    name: `GPX標記點(${current.markerType || '邊界'})`,
                    totalDistance3D: current.totalDistance3D, // 使用 rawPoints 中的累積距離
                    overallPace: overallPace // 新增平均配速
                });
            }
        }
    });

    if (allExportPoints.length === 0) {
        alert("沒有可匯出的 GPX 數據！");
        return;
    }

    // 排序
    allExportPoints.sort((a, b) => a.timeMs - b.timeMs);

    // 修改 CSV 標題和內容以包含累積里程和平均配速
    let csvContent = "路線名稱,類型,時間,累積距離(km),緯度,經度,海拔(m),累積平均配速(分:秒/km),與前點時間差(時:分:秒),海拔變化(m),行走距離差(km),名稱/備註\n";
    allExportPoints.forEach(e => {
        csvContent += `"${e.trackName}",${e.type},"${e.time}",${e.totalDistance3D.toFixed(3)},${e.lat.toFixed(6)},${e.lon.toFixed(6)},${e.elevation},${e.overallPace},${e.timeElapsed},${e.elevationChange},${e.distance3D},"${e.name}"\n`
    });

    var a = new Blob(["\ufeff" + csvContent], {
            type: "text/csv;charset=utf-8;"
        }),
        e = document.createElement("a");
    void 0 !== e.download && (a = URL.createObjectURL(a), e.setAttribute("href", a), e.setAttribute("download", `多軌跡整合紀錄_${(new Date).toISOString().slice(0, 10)}.csv`), document.body.appendChild(e), e.click(), document.body.removeChild(e))
}


// --- 初始載入與事件綁定 (核心修改處) ---

window.onload = function() {
    console.log("🔵 頁面載入完成，初始化地圖...");
    
    // 🌟 1. 調整地圖預設位置至台灣中部 [23.6, 120.9]，縮放等級為 10
    map = L.map("map").setView([23.6, 120.9], 10);
    
    // 🌟 2. 替換為 CartoDB Positron 輕量化地圖，強調道路，資訊簡潔
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
        maxZoom: 19
    }).addTo(map);

    // 取得 HTML 元素
    const i = document.getElementById("gpxUpload");
    var l = document.getElementById("selectGpxBtn");
    var d = document.getElementById("exportConsolidatedDataBtn");
    var m = document.getElementById("clearDataBtn");
    const markerModeSelect = document.getElementById("markerModeSelect");
    const colorModeToggle = document.getElementById("colorModeToggle");

    // GPX 上傳與匯出事件
    l && i && (l.addEventListener("click", () => i.click()), i.addEventListener("change", handleGpxUpload));
    d && (d.addEventListener("click", exportConsolidatedData), d.disabled = true);
    m && m.addEventListener("click", handleClearData);

    // 🌟 全域標記模式切換事件
    if (markerModeSelect) {
        markerModeSelect.value = globalMarkerMode; // 確保初始值正確
        markerModeSelect.addEventListener('change', function() {
            globalMarkerMode = this.value;
            renderGpxTracks();
        });
    }

    // 🌟 全域顏色模式切換事件
    if (colorModeToggle) {
        colorModeToggle.addEventListener('click', function() {
            if (globalColorMode === 'unique') {
                globalColorMode = 'unified';
                this.textContent = "顏色統一";
            } else {
                globalColorMode = 'unique';
                this.textContent = "路線獨立";
            }
            renderGpxTracks();
        });
    }

    // 🌟 響應式設計：側邊欄切換事件
    const openBtn = document.getElementById("openSidebarBtn");
    const closeBtn = document.getElementById("closeSidebarBtn");
    const body = document.body;
    
    if (openBtn && closeBtn) {
        // 開啟側邊欄
        openBtn.addEventListener('click', () => {
            body.classList.add('sidebar-open');
            // 由於地圖被側邊欄遮擋，可能需要更新尺寸
            setTimeout(() => { map.invalidateSize(); }, 300); 
        });

        // 關閉側邊欄
        closeBtn.addEventListener('click', () => {
            body.classList.remove('sidebar-open');
            // 由於地圖被側邊欄遮擋，可能需要更新尺寸
            setTimeout(() => { map.invalidateSize(); }, 300);
        });

        // 首次載入時檢查是否為手機模式，如果側邊欄預設隱藏，則顯示開啟按鈕
        function checkMobileView() {
            if (window.innerWidth <= 768) {
                // 手機模式：地圖佔滿，側邊欄收合
                body.classList.remove('sidebar-open');
                openBtn.style.display = 'block';
            } else {
                // 桌面模式：側邊欄常駐顯示
                body.classList.remove('sidebar-open');
                openBtn.style.display = 'none';
            }
            map.invalidateSize(); // 確保地圖尺寸正確
        }

        window.addEventListener('resize', checkMobileView);
        checkMobileView(); // 頁面載入時執行一次
    }

};
