export const initConnect = (ctx: CanvasRenderingContext2D, signal: AbortSignal) => {
    const isDestroyed = () => {
        return ctx.canvas.parentElement === null || signal.aborted
    }

    type Cords = { x: number, y: number }
    type CordsColor = { x: number, y: number, color: string }
    let lastConn: null | { x: number, y: number, color: string } = null
    const connectedPathes = [] as CordsColor[]
    let connectingPath: Cords[] = []

    const GRID_SIZE = 4
    const TILE_SIZE = 100
    const BOARD_SIZE = TILE_SIZE * GRID_SIZE

    const level = [
        ['red', '', '', 'red'],
        ['', '', '', ''],
        ['', '', '', ''],
        ['', '', '', ''],
    ]

    const getConnectingIndex = (x: number, y: number, color?: string) => {
        if (color && color !== lastConn?.color) return
        const idx = connectingPath.findIndex(a => a.x === x && a.y === y)
        const idxExisting = connectedPathes.findIndex(a => a.x === x && a.y === y)
        if (idx === -1) return
        return idx
    }

    const renderScene = () => {
        ctx.canvas.width = innerWidth
        ctx.canvas.height = innerHeight
        ctx.fillStyle = 'gray'
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)

        const BOARD_START_X = ctx.canvas.width / 2 - BOARD_SIZE / 2
        const BOARD_START_Y = ctx.canvas.height / 2 - BOARD_SIZE / 2

        const isSameColorDot = (color: string, x: number, y: number) => {
            return level[y]?.[x] === color
        }

        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const paddings = 0
                // ctx.fillStyle = 'darkgray'
                // ctx.fillRect(BOARD_START_X + x * TILE_SIZE, BOARD_START_Y + y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
                ctx.fillStyle = 'lightgray'
                const xPos = BOARD_START_X + x * TILE_SIZE
                const yPos = BOARD_START_Y + y * TILE_SIZE
                ctx.fillRect(xPos + paddings, yPos + paddings, TILE_SIZE - paddings * 2, TILE_SIZE - paddings * 2)
                ctx.strokeStyle = 'black'
                ctx.lineWidth = 1
                ctx.strokeRect(xPos, yPos, TILE_SIZE, TILE_SIZE)

                const connectingIndex = connectingPath.findIndex(a => a.x === x && a.y === y)
                const dotRender = level[y]?.[x] || (connectingIndex !== -1 ? lastConn?.color : undefined)
                if (dotRender) {
                    ctx.beginPath()
                    const RADIUS = TILE_SIZE / 2.5
                    ctx.arc(xPos + TILE_SIZE / 2, yPos + TILE_SIZE / 2, RADIUS, 0, Math.PI * 2)
                    ctx.fillStyle = dotRender
                    ctx.fill()

                    for (const [xDiff, yDiff] of [[-1, 0], [0, -1], [1, 0], [0, 1]]) {
                        const diffConnIndex = getConnectingIndex(x + xDiff, y + yDiff, dotRender)
                        const isFromConnection = diffConnIndex !== undefined ? Math.abs(connectingIndex - diffConnIndex) === 1 : false
                        const isConnecting = isSameColorDot(dotRender, x + xDiff, y + yDiff)
                        if (isFromConnection) {
                            const xPosRect = xDiff === -1 ? 0
                                : xDiff === 1 ? TILE_SIZE / 2
                                    : TILE_SIZE / 2 - RADIUS
                            const yPosRect = yDiff === -1 ? 0
                                : yDiff === 1 ? TILE_SIZE / 2
                                    : TILE_SIZE / 2 - RADIUS
                            ctx.fillStyle = dotRender
                            ctx.fillRect(xPos + xPosRect, yPos + yPosRect, yDiff !== 0 ? RADIUS * 2 : TILE_SIZE / 2, yDiff !== 0 ? TILE_SIZE / 2 : RADIUS * 2)
                        }
                    }
                }
            }
        }
    }

    let isDown = false
    const getPointerTile = (e: PointerEvent) => {
        const boundingBox = ctx.canvas.getBoundingClientRect()
        const canvasX = e.clientX - boundingBox.x - (ctx.canvas.width / 2 - BOARD_SIZE / 2)
        const canvasY = e.clientY - boundingBox.y - (ctx.canvas.height / 2 - BOARD_SIZE / 2)
        const x = Math.floor(canvasX / TILE_SIZE)
        const y = Math.floor(canvasY / TILE_SIZE)
        return {
            x,
            y
        }
    }
    const pointerDown = (e: PointerEvent) => {
        if (isDestroyed() || isDown) return
        const { x, y } = getPointerTile(e)
        const dot = level[y]?.[x]
        if (!dot) return

        connectingPath.push({ x, y })
        lastConn = { x, y, color: dot }
    }
    const pointerMove = (e: PointerEvent) => {
        if (isDestroyed() || !lastConn) return
        const { x, y } = getPointerTile(e)
        const xDiff = Math.abs(lastConn.x - x)
        const yDiff = Math.abs(lastConn.y - y)
        if (xDiff > 1 || yDiff > 1 || getConnectingIndex(x, y) !== undefined) return

        connectingPath.push({ x, y })
        lastConn = { x, y, color: lastConn.color }
    }

    const pointerUp = () => {
        isDown = false
        connectingPath = []
        lastConn = null
    }

    window.addEventListener('pointermove', pointerMove)
    window.addEventListener('pointerdown', pointerDown)
    window.addEventListener('pointercancel', () => {
        pointerUp()
    })
    window.addEventListener('pointerup', () => {
        pointerUp()
    })

    const loop = () => {
        if (isDestroyed()) return
        renderScene()
        requestAnimationFrame(loop)
    }

    loop()
}
