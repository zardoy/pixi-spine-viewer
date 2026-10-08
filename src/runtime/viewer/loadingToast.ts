import { toast } from 'sonner'

export type LoadingToastResult = 'success' | 'warning' | 'error'

/** One "Loading…" toast that later resolves in place into a success/warning/error toast. */
export class LoadingToast {
	private id: string | number | undefined

	start(message: string): void {
		this.clear()
		this.id = toast.loading(message)
	}

	clear(): void {
		if (this.id === undefined) return
		toast.dismiss(this.id)
		this.id = undefined
	}

	finish(message: string, type: LoadingToastResult = 'success'): void {
		const id = this.id
		this.id = undefined
		if (id !== undefined) toast.dismiss(id)
		const options = id !== undefined ? { id } : undefined
		if (type === 'success') toast.success(message, options)
		else if (type === 'warning') toast.warning(message, options)
		else toast.error(message, options)
	}
}
