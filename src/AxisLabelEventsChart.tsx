import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  IgrAssigningCategoryStyleEventArgs,
  IgrAxisMouseEventArgs,
  IgrCategorySeries,
  IgrCategoryXAxis,
  IgrColumnSeries,
  IgrDataChart,
  IgrDataChartCategoryCoreModule,
  IgrDataChartCategoryModule,
  IgrDataChartCoreModule,
  IgrDataChartInteractivityModule,
  IgrNumericYAxis,
  IgrSeriesViewer,
  IgrValueOverlay,
  IgrValueOverlayModule,
} from 'igniteui-react-charts'
import { Visibility } from 'igniteui-react-core'
import { salesData } from './salesData'
import './AxisLabelEventsChart.css'

IgrDataChartCoreModule.register()
IgrDataChartCategoryCoreModule.register()
IgrDataChartCategoryModule.register()
IgrDataChartInteractivityModule.register()
IgrValueOverlayModule.register()

const X_AXIS = 'xAxis'
const Y_AXIS = 'yAxis'

interface MonthRange {
  start: number
  end: number
}

const toRange = (a: number, b: number): MonthRange => ({ start: Math.min(a, b), end: Math.max(a, b) })

const formatMillions = (v: number) => `${v.toLocaleString('ja-JP')} 百万円`

/** X 軸ラベルのイベントから、対応するデータ項目のインデックスを求める。 */
function resolveMonthIndex(e: IgrAxisMouseEventArgs): number {
  const byLabel = salesData.findIndex((d) => d.month === e.label)
  if (byLabel >= 0) return byLabel
  const index = Math.round(e.axisValue)
  return index >= 0 && index < salesData.length ? index : -1
}

/** Y 軸ラベルは書式付きの数値（"1,200" など）なので、表示文字列を数値に変換する。 */
function parseAxisNumber(label: string): number | null {
  const value = Number(label.replace(/[^\d.-]/g, ''))
  return label.trim() !== '' && Number.isFinite(value) ? value : null
}

export function AxisLabelEventsChart() {
  const currentSeriesRef = useRef<IgrColumnSeries>(null)
  const previousSeriesRef = useRef<IgrColumnSeries>(null)

  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  // 月ラベル上でドラッグ中の範囲。hoverIndex とは別に保持し、ラベルから外れても
  // （ラベル間の隙間やプロット領域にはみ出した場合など）範囲が縮まないようにする。
  const [drag, setDragState] = useState<MonthRange | null>(null)
  const [selection, setSelection] = useState<MonthRange | null>(null)
  const [target, setTarget] = useState<number | null>(null)

  // window の pointerup ハンドラーから同期的に読めるよう、ドラッグ範囲を ref にも保持する。
  // `start` はドラッグを開始した月、`end` はポインターが最後に入った月ラベル。
  const dragRef = useRef<MonthRange | null>(null)

  const setDrag = useCallback((value: MonthRange | null) => {
    dragRef.current = value
    setDragState(value)
  }, [])

  /** ドラッグを終了し、ドラッグした範囲を選択範囲として確定する。 */
  const commitDrag = useCallback(() => {
    const current = dragRef.current
    if (current === null) return
    setSelection(toRange(current.start, current.end))
    setDrag(null)
  }, [setDrag])

  // ---- 軸ラベルのイベントハンドラー ----------------------------------------------

  /** Enter: その月をプレビュー表示する。ドラッグ中は範囲をその月まで広げる。 */
  const onLabelEnter = useCallback(
    (_s: IgrSeriesViewer, e: IgrAxisMouseEventArgs) => {
      if (e.axis?.name !== X_AXIS) return
      const index = resolveMonthIndex(e)
      if (index < 0) return
      setHoverIndex(index)
      const current = dragRef.current
      if (current !== null && current.end !== index) setDrag({ start: current.start, end: index })
    },
    [setDrag],
  )

  /** Leave: プレビューを消す。ドラッグ中の範囲はそのまま保持する。 */
  const onLabelLeave = useCallback(() => {
    setHoverIndex(null)
  }, [])

  /** 月ラベルで Down: 範囲選択を開始する。 */
  const onLabelDown = useCallback(
    (_s: IgrSeriesViewer, e: IgrAxisMouseEventArgs) => {
      if (e.axis?.name !== X_AXIS) return
      const index = resolveMonthIndex(e)
      if (index >= 0) setDrag({ start: index, end: index })
    },
    [setDrag],
  )

  /** 月ラベルで Up: 開始月からこのラベルの月までを選択範囲として確定する。 */
  const onLabelUp = useCallback(
    (_s: IgrSeriesViewer, e: IgrAxisMouseEventArgs) => {
      const current = dragRef.current
      if (e.axis?.name !== X_AXIS || current === null) return
      const index = resolveMonthIndex(e)
      if (index >= 0) dragRef.current = { start: current.start, end: index }
      commitDrag()
    },
    [commitDrag],
  )

  /** 値ラベルで Click: その値を目標ラインに設定する。同じ値をもう一度クリックすると解除する。 */
  const onLabelClick = useCallback(
    (_s: IgrSeriesViewer, e: IgrAxisMouseEventArgs) => {
      if (e.axis?.name !== Y_AXIS) return
      const value = parseAxisNumber(e.label)
      if (value !== null) setTarget((prev) => (prev === value ? null : value))
    },
    [],
  )

  // 月ラベル以外の場所でマウスを離した場合も、その時点で強調表示している範囲を確定する。
  // チャートがマウスイベントのバブリングを止めるため、キャプチャフェーズで受け取る。この処理は
  // axisLabelMouseUp より先に実行されるが、ポインター下のラベルには既に Enter 済みなので `end` は最新の値になっている。
  useEffect(() => {
    window.addEventListener('pointerup', commitDrag, { capture: true })
    return () => window.removeEventListener('pointerup', commitDrag, { capture: true })
  }, [commitDrag])

  // ---- 縦棒の強調表示 ------------------------------------------------------------

  // 優先順位: ドラッグ中の範囲 > 確定した選択範囲 > ホバー中の 1 か月のプレビュー。
  // ドラッグ終了時にポインターがラベル上に残っていても選択範囲の強調が保たれるよう、選択範囲をホバーより優先する。
  const highlight: MonthRange | null = useMemo(() => {
    if (drag !== null) return toRange(drag.start, drag.end)
    if (selection !== null) return selection
    if (hoverIndex !== null) return toRange(hoverIndex, hoverIndex)
    return null
  }, [drag, hoverIndex, selection])

  // assigningCategoryStyle はチャート側から呼び出されるため、最新の強調範囲は ref から読む。
  const highlightRef = useRef(highlight)
  useEffect(() => {
    highlightRef.current = highlight
    currentSeriesRef.current?.notifyVisualPropertiesChanged()
    previousSeriesRef.current?.notifyVisualPropertiesChanged()
  }, [highlight])

  const fadeOutsideHighlight = useCallback((_s: IgrCategorySeries, e: IgrAssigningCategoryStyleEventArgs) => {
    const range = highlightRef.current
    if (range && (e.startIndex < range.start || e.startIndex > range.end)) {
      e.opacity = 0.25
    }
  }, [])

  // ---- 集計値 --------------------------------------------------------------------

  const summary = useMemo(() => {
    const range = selection ?? { start: 0, end: salesData.length - 1 }
    const items = salesData.slice(range.start, range.end + 1)
    const current = items.reduce((sum, d) => sum + d.current, 0)
    const previous = items.reduce((sum, d) => sum + d.previous, 0)
    const growth = previous === 0 ? 0 : ((current - previous) / previous) * 100
    const hitTarget = target === null ? null : items.filter((d) => d.current >= target).length
    const title =
      range.start === range.end
        ? salesData[range.start].month
        : `${salesData[range.start].month} 〜 ${salesData[range.end].month}`
    return { title, months: items.length, current, previous, growth, hitTarget, isAll: selection === null }
  }, [selection, target])

  return (
    <section className="axis-demo" aria-labelledby="axis-demo-title">
      <header className="axis-demo__header">
        <h1 id="axis-demo-title">月次売上 — 軸ラベル操作</h1>
        <ul className="axis-demo__hints">
          <li>
            <strong>月ラベル</strong>をドラッグすると期間を選択（未選択時はホバーでその月を強調）
          </li>
          <li>
            <strong>値ラベル</strong>をクリックすると目標ラインを設定（もう一度クリックで解除）
          </li>
        </ul>
      </header>

      <div className="axis-demo__body">
        <div className="axis-demo__chart">
          <IgrDataChart
            width="100%"
            height="100%"
            isHorizontalZoomEnabled={false}
            isVerticalZoomEnabled={false}
            axisLabelMouseEnter={onLabelEnter}
            axisLabelMouseLeave={onLabelLeave}
            axisLabelMouseDown={onLabelDown}
            axisLabelMouseUp={onLabelUp}
            axisLabelMouseClick={onLabelClick}
          >
            <IgrCategoryXAxis name={X_AXIS} dataSource={salesData} label="month" interval={1} />
            <IgrNumericYAxis name={Y_AXIS} minimumValue={0} title="百万円" />
            <IgrColumnSeries
              ref={previousSeriesRef}
              name="previous"
              title="前年度"
              xAxisName={X_AXIS}
              yAxisName={Y_AXIS}
              dataSource={salesData}
              valueMemberPath="previous"
              brush="#9aa5b1"
              outline="#9aa5b1"
              isCustomCategoryStyleAllowed
              assigningCategoryStyle={fadeOutsideHighlight}
            />
            <IgrColumnSeries
              ref={currentSeriesRef}
              name="current"
              title="今年度"
              xAxisName={X_AXIS}
              yAxisName={Y_AXIS}
              dataSource={salesData}
              valueMemberPath="current"
              brush="#2f6fdb"
              outline="#2f6fdb"
              isCustomCategoryStyleAllowed
              assigningCategoryStyle={fadeOutsideHighlight}
            />
            {/* IgrDataChart の子要素に null / false は渡せないため、条件付きレンダリングではなく visibility で表示を切り替える。 */}
            <IgrValueOverlay
              name="target"
              axisName={Y_AXIS}
              value={target ?? 0}
              visibility={target === null ? Visibility.Collapsed : Visibility.Visible}
              brush="#d64545"
              thickness={2}
              dashArray={[6, 4]}
              isAxisAnnotationEnabled
              axisAnnotationBackground="#d64545"
              axisAnnotationTextColor="#ffffff"
            />
          </IgrDataChart>
        </div>

        <aside className="axis-demo__side">
          <div className="axis-demo__legend" aria-label="凡例">
            <span className="swatch swatch--current" /> 今年度
            <span className="swatch swatch--previous" /> 前年度
            <span className="swatch swatch--target" /> 目標
          </div>

          <section className="card" aria-live="polite">
            <h2>{summary.isAll ? '通期' : '選択期間'}：{summary.title}</h2>
            <dl>
              <dt>今年度</dt>
              <dd>{formatMillions(summary.current)}</dd>
              <dt>前年度</dt>
              <dd>{formatMillions(summary.previous)}</dd>
              <dt>前年比</dt>
              <dd className={summary.growth >= 0 ? 'up' : 'down'}>
                {summary.growth >= 0 ? '+' : ''}
                {summary.growth.toFixed(1)}%
              </dd>
              <dt>目標達成</dt>
              <dd>
                {target === null
                  ? '未設定'
                  : `${summary.hitTarget} / ${summary.months} か月（目標 ${formatMillions(target)}）`}
              </dd>
            </dl>
            <div className="card__actions">
              <button type="button" onClick={() => setSelection(null)} disabled={selection === null}>
                期間選択を解除
              </button>
              <button type="button" onClick={() => setTarget(null)} disabled={target === null}>
                目標を解除
              </button>
            </div>
          </section>

        </aside>
      </div>
    </section>
  )
}
