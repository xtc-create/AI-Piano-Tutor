import PianoTutorApp from '../page'

export default async function RoutedPianoTutor({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return <PianoTutorApp initialPath={`/${path.join('/')}`} />
}
