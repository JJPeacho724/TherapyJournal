/**
 * Template-based synthetic journal text generator.
 *
 * Produces 3-8 sentence journal entries consistent with mood level and themes.
 * All text is synthetic — no real patient language.
 */

import type { EvidenceSnippetItem } from '@/types/synthetic'

const MOOD_BANDS = {
  low: { range: [1, 3.5] as const, label: 'low' },
  mid: { range: [3.5, 6.5] as const, label: 'mid' },
  high: { range: [6.5, 10] as const, label: 'high' },
} as const

type MoodBand = keyof typeof MOOD_BANDS

function getMoodBand(mood: number): MoodBand {
  if (mood <= 3.5) return 'low'
  if (mood <= 6.5) return 'mid'
  return 'high'
}

const TEMPLATES: Record<MoodBand, string[]> = {
  low: [
    'Today was really tough. I could barely get out of bed and everything felt overwhelming.',
    'I felt drained all day. It was hard to focus on anything and I kept zoning out.',
    'Not a great day. My energy was very low and I did not want to talk to anyone.',
    'I woke up feeling heavy. The day dragged on and nothing seemed to help.',
    'Everything felt pointless today. I went through the motions but was not really present.',
    'I had trouble sleeping again last night which made everything worse during the day.',
    'Today was one of those days where I just wanted to be alone. Even small tasks felt like too much.',
    'I noticed my thoughts kept going in circles. I tried to distract myself but it did not work well.',
  ],
  mid: [
    'It was an okay day. Some ups and downs but I managed to get through most of what I needed to do.',
    'Today was mixed. I had a decent morning but felt a dip in the afternoon.',
    'I had a regular day. Nothing particularly great or terrible happened.',
    'I felt somewhat neutral today. I completed my tasks but without much enthusiasm.',
    'Today was fine overall. I had moments of feeling better and moments of feeling worse.',
    'I managed to get some things done today which felt decent. Still some lingering unease though.',
    'An average day. I noticed some patterns in my mood but tried to stay level.',
    'Not bad today. I had a productive stretch in the morning and rested in the evening.',
  ],
  high: [
    'Today was genuinely good. I felt more like myself and had real energy for the first time in a while.',
    'I had a great day. I was able to focus well and even enjoyed some activities.',
    'I woke up feeling rested and the day went smoothly. I actually looked forward to things.',
    'Today felt lighter. I connected with a friend and it lifted my spirits considerably.',
    'I felt motivated today and accomplished more than I expected. It was a pleasant surprise.',
    'Good day overall. I noticed I was smiling more and my thoughts were clearer.',
    'I felt calm and grounded today. I was able to handle small stressors without spiraling.',
    'Today was one of the better days recently. I felt present and engaged with what I was doing.',
  ],
}

const THEME_SENTENCES: Record<string, Record<MoodBand, string[]>> = {
  sleep: {
    low: [
      'I barely slept last night, maybe three or four hours.',
      'My sleep has been terrible — waking up multiple times.',
    ],
    mid: [
      'Sleep was so-so. I got about six hours but it was restless.',
      'I slept okay but woke up feeling groggy.',
    ],
    high: [
      'I slept well last night, about seven or eight hours.',
      'My sleep has been improving lately which helps a lot.',
    ],
  },
  appetite: {
    low: [
      'I did not feel like eating at all today. Had to force myself to have something small.',
      'My appetite has been off. I skipped lunch entirely.',
    ],
    mid: [
      'I ate regular meals today though I was not very hungry.',
      'Appetite was normal. I had my usual meals.',
    ],
    high: [
      'I actually enjoyed my meals today. Cooking felt satisfying.',
      'Had a good appetite and tried a new recipe which turned out well.',
    ],
  },
  rumination: {
    low: [
      'I kept replaying the same thoughts over and over. It felt like a loop I could not escape.',
      'My mind was stuck on negative patterns again. I could not stop overthinking.',
    ],
    mid: [
      'I caught myself ruminating a few times but managed to redirect my focus somewhat.',
      'Had some repetitive thoughts but they were not as intense as before.',
    ],
    high: [
      'My thoughts felt clearer today. Less looping and more forward-looking.',
      'I noticed I was not ruminating as much, which was a relief.',
    ],
  },
  motivation: {
    low: [
      'I had zero motivation to do anything productive.',
      'Everything felt like too much effort. I could not bring myself to start tasks.',
    ],
    mid: [
      'I had some motivation in bursts but it faded quickly.',
      'I managed to get a few things done but had to push through resistance.',
    ],
    high: [
      'I felt genuinely motivated today. Started and finished tasks without much struggle.',
      'My drive was back. I made progress on things I had been putting off.',
    ],
  },
  social_withdrawal: {
    low: [
      'I canceled plans with a friend again. I just could not face being around people.',
      'I avoided all social interactions today. Even texting felt overwhelming.',
    ],
    mid: [
      'I talked to one person briefly today. It was okay but I did not seek it out.',
      'I kept to myself mostly but did respond to a few messages.',
    ],
    high: [
      'I reached out to a friend and we had a nice conversation. It felt good to connect.',
      'I went out and spent time with people, which I have not done in a while.',
    ],
  },
  panic: {
    low: [
      'I had a moment of intense unease with a racing heart. It passed but left me shaken.',
      'I felt a wave of tension and restlessness that came out of nowhere.',
    ],
    mid: [
      'I had a brief moment of unease but used breathing exercises to settle it.',
      'Some nervous energy today but nothing I could not manage.',
    ],
    high: [
      'I felt calm most of the day. No major spikes of tension.',
      'My nervous system felt more settled today. I could handle things calmly.',
    ],
  },
  irritability: {
    low: [
      'I was snapping at everything today. Even small things made me feel on edge.',
      'I felt frustrated and irritable all day for no clear reason.',
    ],
    mid: [
      'I had a few moments of irritation but caught myself and took a breath.',
      'Some frustration crept in during the afternoon but I managed it okay.',
    ],
    high: [
      'I felt patient and even-keeled today. Things that usually bother me did not.',
      'I handled a frustrating situation calmly which felt like growth.',
    ],
  },
  substance_use: {
    low: [
      'I had more drinks than I planned last night. It felt like the only way to quiet my mind.',
      'I found myself reaching for substances to cope again.',
    ],
    mid: [
      'I thought about having a drink to take the edge off but decided against it.',
      'I kept my use moderate today. Trying to be more mindful about it.',
    ],
    high: [
      'I did not feel the urge to use anything today. That felt like progress.',
      'I went the whole day without thinking about needing anything to cope.',
    ],
  },
  work_stress: {
    low: [
      'Work was incredibly stressful. I felt behind on everything and could not catch up.',
      'The pressure at work is becoming too much. I could not concentrate at all.',
    ],
    mid: [
      'Work was busy but manageable. Some stress but I handled it.',
      'Had a deadline today which was stressful but I met it.',
    ],
    high: [
      'Work went well today. I felt on top of things and productive.',
      'I had a good day at work. Felt competent and engaged.',
    ],
  },
  self_care: {
    low: [
      'I did not take care of myself at all today. Skipped basic routines.',
      'Self-care felt impossible. I could not even bring myself to shower.',
    ],
    mid: [
      'I did some basic self-care today. Went for a short walk.',
      'I tried to take care of myself a bit. Made an effort to eat well.',
    ],
    high: [
      'I took time for self-care today — exercised and cooked a healthy meal.',
      'I made self-care a priority. Went for a run and it felt great.',
    ],
  },
  social_connection: {
    low: [
      'I felt very isolated today. No one checked in and I did not reach out either.',
      'I thought about calling someone but could not bring myself to do it.',
    ],
    mid: [
      'I had a brief but nice interaction with a colleague.',
      'I texted a friend and we exchanged a few messages. It was fine.',
    ],
    high: [
      'I spent quality time with a friend today and it really lifted my mood.',
      'I had meaningful conversations today that left me feeling connected.',
    ],
  },
  exercise: {
    low: [
      'I did not exercise at all. Even the thought of it was exhausting.',
      'Physical activity felt completely out of reach today.',
    ],
    mid: [
      'I went for a short walk today. Not much but better than nothing.',
      'I did some light stretching. Trying to build the habit back up.',
    ],
    high: [
      'I had a great workout today. My body and mind both felt better afterward.',
      'I went for a long run and it cleared my head. Exercise is really helping.',
    ],
  },
}

const CLOSING_SENTENCES: Record<MoodBand, string[]> = {
  low: [
    'I hope tomorrow is at least a little better.',
    'Going to try to rest and not think too much.',
    'I know these days happen but it still feels hard in the moment.',
  ],
  mid: [
    'Overall a manageable day. Taking it one step at a time.',
    'I am trying to be patient with the process.',
    'Tomorrow is another chance to build on today.',
  ],
  high: [
    'Grateful for today. Hoping to carry this momentum forward.',
    'It feels good to have a day like this. I want to remember it.',
    'I am noticing progress even if it is gradual.',
  ],
}

/**
 * Generate a synthetic journal entry text and evidence snippets.
 *
 * @param mood - Current mood score (1-10)
 * @param themes - Selected themes for this entry
 * @param rng - Seeded random function
 * @returns Journal text and evidence snippets mapping quotes to themes
 */
export function generateJournalEntry(
  mood: number,
  themes: string[],
  rng: () => number
): { text: string; evidenceSnippets: EvidenceSnippetItem[] } {
  const band = getMoodBand(mood)
  const sentences: string[] = []
  const evidenceSnippets: EvidenceSnippetItem[] = []

  // Opening sentence
  const openers = TEMPLATES[band]
  sentences.push(pick(openers, rng))

  // Theme sentences (1-2 per theme)
  for (const theme of themes) {
    const themeSentences = THEME_SENTENCES[theme]?.[band]
    if (themeSentences && themeSentences.length > 0) {
      const sentence = pick(themeSentences, rng)
      sentences.push(sentence)
      evidenceSnippets.push({ quote: sentence, theme })
    }
  }

  // Optionally add a second sentence for the first theme
  if (themes.length > 0 && rng() > 0.5) {
    const extraTheme = themes[0]
    const extraPool = THEME_SENTENCES[extraTheme]?.[band]
    if (extraPool && extraPool.length > 1) {
      const existing = sentences.slice(1)
      const remaining = extraPool.filter(s => !existing.includes(s))
      if (remaining.length > 0) {
        sentences.push(pick(remaining, rng))
      }
    }
  }

  // Closing
  sentences.push(pick(CLOSING_SENTENCES[band], rng))

  return {
    text: sentences.join(' '),
    evidenceSnippets,
  }
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]
}
