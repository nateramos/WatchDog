// Pictures made by tracking/make_demo_images.py from 0:04 of the sample clip. Speeds are the
// desktop prototype's OpenVINO models on a 2020 MacBook Air (see README "Speed").
const STAGES = [
  {
    src: '/images/person.jpg',
    title: '1. Person detection',
    color: 'yellow',
    speed: '~33 ms per frame',
    text: 'First, WatchDog finds each person in the frame (yellow box, 86%) and maps their arms (white skeleton, illustrated here) to see where their hands are. It never looks at faces to identify anyone.',
  },
  {
    src: '/images/objects.jpg',
    title: '2. Object detection',
    color: 'blue',
    speed: '~112 ms per frame',
    text: 'Next, WatchDog looks at what that person is holding and draws a box around the object in their hands (blue box). At this step it only knows something is there, not what it is.',
  },
  {
    src: '/images/weapon.jpg',
    title: '3. Weapon detection',
    color: 'red',
    speed: '~101 ms per frame',
    text: 'Finally, WatchDog checks whether that object is a weapon. Its model, trained on labeled gun and knife images, flags a possible gun (red box) at 78%. Only this step sends a frame to a human reviewer.',
  },
]

// "What WatchDog sees": the same frame at each of the three detection steps.
export default function Stages() {
  return (
    <section className="panel">
      <h2>What WatchDog sees</h2>
      <p className="muted">
        WatchDog works in three steps: find the person, find what they are holding, then
        check whether it is a weapon. Here is the same frame from the demo video at each step.
      </p>
      <div className="stages">
        {STAGES.map((stage) => (
          <figure key={stage.src} className={`stage stage-${stage.color}`}>
            <img src={stage.src} alt={`${stage.title}: ${stage.text}`} loading="lazy" />
            <figcaption>
              <strong>{stage.title}</strong>
              <span className="speed">{stage.speed}</span>
              <span>{stage.text}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="muted small speed-note">
        <strong>Speed:</strong> all three steps take about a quarter of a second per frame
        (about 4 frames per second) in the desktop prototype on a 2020 MacBook Air with no
        graphics card. The demo below runs only step 3, inside your browser, at about 1 to 1.5
        seconds per frame.
      </p>
    </section>
  )
}
