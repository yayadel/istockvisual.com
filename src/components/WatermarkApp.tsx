import { Component, type ErrorInfo, type ReactNode } from 'react';
import WatermarkWorkspace from './WatermarkWorkspace';

type Props = { children?: ReactNode };
type State = { error: string | null };

class Boundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error: error.message || 'Watermark tool failed' };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error('Watermark crash', error, info);
	}

	render() {
		if (this.state.error) {
			return (
				<div className="tools-work">
					<p className="tools-work__error">
						Watermark error: {this.state.error}. Refresh the page and try again.
					</p>
				</div>
			);
		}
		return this.props.children ?? <WatermarkWorkspace />;
	}
}

export default function WatermarkApp() {
	return (
		<Boundary>
			<WatermarkWorkspace />
		</Boundary>
	);
}
