import { lazy, Suspense, useEffect } from 'react';
import type { ComponentProps } from 'react';

const FilerobotAssetEditorCore = lazy(() => import('./FilerobotAssetEditorCore'));

type Props = ComponentProps<typeof FilerobotAssetEditorCore>;

export default function FilerobotAssetEditor(props: Props) {
	useEffect(() => {
		void import('./FilerobotAssetEditorCore');
	}, []);

	return (
		<Suspense fallback={null}>
			<FilerobotAssetEditorCore {...props} />
		</Suspense>
	);
}
