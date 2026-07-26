export const defaultGameConfig = {
    JUMP_SPEED: 1,
    DELTA_CAP: 50
}

type Obstacle = {
    y: number
    isLeft: boolean
    width: number
}

export const initJumper = (ctx: CanvasRenderingContext2D, signal: AbortSignal, gameConfig = defaultGameConfig) => {
    const isDestroyed = () => {
        return ctx.canvas.parentElement === null || signal.aborted
    }

    let inGameTime = 0
    const OBSTACLE_WIDTH = 50
    const AREA_WIDTH = 370
    const PLAYER_BOTTOM_Y = 30
    const PLAYER_RADIUS = 30

    let playerX = 0
    let progressingDir = 0
    let wallStick = 0
    let rendered = 0
    let obstacles = [{
        y: 0,
        isLeft: true,
        width: 100,
    }] as Obstacle[]
    const runSpeed = 0.1

    const renderScene = (deltaRaw: number) => {
        const delta = Math.min(deltaRaw, gameConfig.DELTA_CAP)
        rendered++
        ctx.canvas.width = innerWidth
        ctx.canvas.height = innerHeight

        const OBSTACLE_HEIGHT = 10
        const START_AREA_X = ctx.canvas.width / 2 - AREA_WIDTH / 2
        const END_AREA_X = START_AREA_X + AREA_WIDTH
        const PLAYER_HIT_RIGHT = AREA_WIDTH - PLAYER_RADIUS * 2
        const BORDER_WIDTH = 10
        const TILE = 10
        const TILES_X = START_AREA_X / TILE
        const TILES_Y = ctx.canvas.height / TILE
        // bricks
        for (let x = 0; x < TILES_X; x += 1) {
            for (let y = 0; y < TILES_Y; y += 1) {
                ctx.fillStyle = ((x + (y % 2 === 0 ? 0 : 1)) % 2 === 0) ? 'rgb(77 33 10)' : 'rgb(123 79 37)'
                ctx.fillRect(x * TILE, y * TILE, TILE, TILE)
            }
        }
        for (let x = 0; x < TILES_X; x += 1) {
            for (let y = 0; y < TILES_Y; y += 1) {
                ctx.fillStyle = ((x + (y % 2 === 0 ? 0 : 1)) % 2 === 0) ? 'rgb(77 33 10)' : 'rgb(123 79 37)'
                ctx.fillRect(x * TILE + START_AREA_X + AREA_WIDTH, y * TILE, TILE, TILE)
            }
        }
        // border
        for (const x of [START_AREA_X - BORDER_WIDTH, START_AREA_X + AREA_WIDTH]) {
            ctx.fillStyle = 'rgb(250 84 24)'
            ctx.fillRect(x, 0, BORDER_WIDTH, ctx.canvas.height)
        }
        // game
        ctx.fillStyle = 'rgb(254 235 185)'
        ctx.fillRect(START_AREA_X, 0, AREA_WIDTH, ctx.canvas.height)

        const renderPlayer = () => {
            const circle = (r: number, color: string) => {
                ctx.beginPath()
                ctx.arc(START_AREA_X + playerX + PLAYER_RADIUS, ctx.canvas.height - PLAYER_BOTTOM_Y - PLAYER_RADIUS, r, 0, Math.PI * 2)
                ctx.fillStyle = color
                ctx.fill()
            }
            circle(PLAYER_RADIUS, 'lime')
            // circle(5, 'black')

            ctx.strokeStyle = 'black'
            ctx.lineWidth = 0.5
            ctx.strokeRect(START_AREA_X + playerX, ctx.canvas.height - PLAYER_BOTTOM_Y - PLAYER_RADIUS * 2, PLAYER_RADIUS * 2, PLAYER_RADIUS * 2)
        }

        const renderObstable = (y: number, isRightSide: boolean, width: number) => {
            ctx.fillStyle = 'red'
            ctx.fillRect(!isRightSide ? START_AREA_X : END_AREA_X - width, y, width, OBSTACLE_HEIGHT)
        }

        // move player
        const deltaMove = progressingDir * delta * gameConfig.JUMP_SPEED
        playerX += deltaMove
        const leftHit = playerX < 0
        const rightHit = playerX > PLAYER_HIT_RIGHT
        if (leftHit || rightHit) {
            progressingDir = 0
            if (leftHit) {
                wallStick = 0
                playerX = 0
            }
            if (rightHit) {
                wallStick = 1
                playerX = PLAYER_HIT_RIGHT
            }
        }

        renderPlayer()

        for (const obstacle of obstacles) {
            renderObstable(obstacle.y, obstacle.isLeft, obstacle.width)

            if (deltaMove !== 0) {
                obstacle.y += delta * runSpeed
            }

            // if ()
        }
        obstacles = obstacles.filter(obstacle => {
            return obstacle.y < ctx.canvas.height
        })

        if (obstacles.length < 1) {
            const ADD_OBSTACLES = 5
            let lastY = 0
            for (let i = 0; i < ADD_OBSTACLES; i++) {
                const newY = lastY - randomInt(50, 180)
                obstacles.push({
                    y: newY,
                    isLeft: !!randomInt(0, 1),
                    width: randomInt(100, 200),
                })
                lastY = newY
            }
        }

        inGameTime += delta
    }

    let last = performance.now()
    const tick = (t: number) => {
        if (isDestroyed() || document.hidden) return
        renderScene(t - last)
        last = t
    }
    // const loop = (t: number) => {
    // if (isDestroyed()) return
    //     tick(t)
    //     requestAnimationFrame(loop)
    //     last = t
    // }
    // loop(performance.now())

    setInterval(() => {
        tick(performance.now())
    }, 1000 / 60)

    addEventListener('keydown', (e) => {
        if (isDestroyed()) return
        if (e.code === "Space") {
            if (progressingDir !== 0) return
            progressingDir = wallStick === 0 ? 1 : -1
        }
    })

    setInterval(() => {
        if (isDestroyed()) return
        console.log('fps', rendered)
        rendered = 0
    }, 1000)
}

export const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
export const randomArray = <T>(array: T[]) => array[Math.floor(Math.random() * array.length)]
