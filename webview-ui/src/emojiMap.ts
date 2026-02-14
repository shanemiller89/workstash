/**
 * Comprehensive mapping of Mattermost/Slack emoji shortcodes to Unicode characters.
 * Used to render :shortcode: as actual emoji glyphs in the UI.
 */

// ─── Unicode Emoji Map ────────────────────────────────────────────

const EMOJI_MAP: Record<string, string> = {
    // Smileys & People
    'grinning': '😀', 'smiley': '😃', 'smile': '😄', 'grin': '😁', 'laughing': '😆',
    'satisfied': '😆', 'sweat_smile': '😅', 'rofl': '🤣', 'joy': '😂',
    'slightly_smiling_face': '🙂', 'upside_down_face': '🙃', 'wink': '😉',
    'blush': '😊', 'innocent': '😇', 'smiling_face_with_three_hearts': '🥰',
    'heart_eyes': '😍', 'star_struck': '🤩', 'kissing_heart': '😘',
    'kissing': '😗', 'relaxed': '☺️', 'kissing_closed_eyes': '😚',
    'kissing_smiling_eyes': '😙', 'smiling_face_with_tear': '🥲',
    'yum': '😋', 'stuck_out_tongue': '😛', 'stuck_out_tongue_winking_eye': '😜',
    'zany_face': '🤪', 'stuck_out_tongue_closed_eyes': '😝', 'money_mouth_face': '🤑',
    'hugs': '🤗', 'hand_over_mouth': '🤭', 'shushing_face': '🤫',
    'thinking': '🤔', 'thinking_face': '🤔', 'zipper_mouth_face': '🤐',
    'raised_eyebrow': '🤨', 'neutral_face': '😐', 'expressionless': '😑',
    'no_mouth': '😶', 'smirk': '😏', 'unamused': '😒',
    'roll_eyes': '🙄', 'grimacing': '😬', 'lying_face': '🤥',
    'relieved': '😌', 'pensive': '😔', 'sleepy': '😪',
    'drooling_face': '🤤', 'sleeping': '😴', 'mask': '😷',
    'face_with_thermometer': '🤒', 'face_with_head_bandage': '🤕',
    'nauseated_face': '🤢', 'vomiting_face': '🤮', 'sneezing_face': '🤧',
    'hot_face': '🥵', 'cold_face': '🥶', 'woozy_face': '🥴',
    'dizzy_face': '😵', 'exploding_head': '🤯', 'cowboy_hat_face': '🤠',
    'partying_face': '🥳', 'disguised_face': '🥸', 'sunglasses': '😎',
    'nerd_face': '🤓', 'monocle_face': '🧐', 'confused': '😕',
    'worried': '😟', 'slightly_frowning_face': '🙁', 'frowning_face': '☹️',
    'open_mouth': '😮', 'hushed': '😯', 'astonished': '😲',
    'flushed': '😳', 'pleading_face': '🥺', 'frowning': '😦',
    'anguished': '😧', 'fearful': '😨', 'cold_sweat': '😰',
    'disappointed_relieved': '😥', 'cry': '😢', 'sob': '😭',
    'scream': '😱', 'confounded': '😖', 'persevere': '😣',
    'disappointed': '😞', 'sweat': '😓', 'weary': '😩',
    'tired_face': '😫', 'yawning_face': '🥱', 'triumph': '😤',
    'rage': '😡', 'pout': '😡', 'angry': '😠', 'cursing_face': '🤬',
    'smiling_imp': '😈', 'imp': '👿', 'skull': '💀',
    'skull_and_crossbones': '☠️', 'hankey': '💩', 'poop': '💩',
    'clown_face': '🤡', 'japanese_ogre': '👹', 'japanese_goblin': '👺',
    'ghost': '👻', 'alien': '👽', 'space_invader': '👾',
    'robot': '🤖', 'smiley_cat': '😺', 'smile_cat': '😸',
    'joy_cat': '😹', 'heart_eyes_cat': '😻', 'smirk_cat': '😼',
    'kissing_cat': '😽', 'scream_cat': '🙀', 'crying_cat_face': '😿',
    'pouting_cat': '😾', 'see_no_evil': '🙈', 'hear_no_evil': '🙉',
    'speak_no_evil': '🙊',

    // Gestures & Body
    'wave': '👋', 'raised_back_of_hand': '🤚', 'raised_hand_with_fingers_splayed': '🖐️',
    'hand': '✋', 'raised_hand': '✋', 'vulcan_salute': '🖖',
    'ok_hand': '👌', 'pinched_fingers': '🤌', 'pinching_hand': '🤏',
    'v': '✌️', 'crossed_fingers': '🤞', 'love_you_gesture': '🤟',
    'metal': '🤘', 'call_me_hand': '🤙', 'point_left': '👈',
    'point_right': '👉', 'point_up_2': '👆', 'middle_finger': '🖕',
    'fu': '🖕', 'point_down': '👇', 'point_up': '☝️',
    '+1': '👍', 'thumbsup': '👍', '-1': '👎', 'thumbsdown': '👎',
    'fist_raised': '✊', 'fist': '✊', 'fist_oncoming': '👊',
    'facepunch': '👊', 'punch': '👊', 'fist_left': '🤛',
    'fist_right': '🤜', 'clap': '👏', 'raised_hands': '🙌',
    'open_hands': '👐', 'palms_up_together': '🤲', 'handshake': '🤝',
    'pray': '🙏', 'writing_hand': '✍️', 'nail_care': '💅',
    'selfie': '🤳', 'muscle': '💪', 'mechanical_arm': '🦾',

    // Hearts & Emotions
    'heart': '❤️', 'red_heart': '❤️', 'orange_heart': '🧡', 'yellow_heart': '💛',
    'green_heart': '💚', 'blue_heart': '💙', 'purple_heart': '💜',
    'black_heart': '🖤', 'brown_heart': '🤎', 'white_heart': '🤍',
    'broken_heart': '💔', 'heavy_heart_exclamation': '❣️',
    'two_hearts': '💕', 'revolving_hearts': '💞', 'heartbeat': '💓',
    'heartpulse': '💗', 'sparkling_heart': '💖', 'cupid': '💘',
    'gift_heart': '💝', 'heart_decoration': '💟',
    'peace_symbol': '☮️', 'latin_cross': '✝️', 'star_of_david': '✡️',

    // Celebrations & Objects
    'tada': '🎉', 'confetti_ball': '🎊', 'balloon': '🎈',
    'birthday': '🎂', 'gift': '🎁', 'trophy': '🏆',
    'medal_sports': '🏅', 'medal_military': '🎖️', 'crown': '👑',
    '100': '💯', 'fire': '🔥', 'sparkles': '✨',
    'star': '⭐', 'star2': '🌟', 'dizzy': '💫',
    'boom': '💥', 'collision': '💥', 'sweat_drops': '💦',
    'dash': '💨', 'hole': '🕳️', 'bomb': '💣',
    'speech_balloon': '💬', 'thought_balloon': '💭',
    'zzz': '💤', 'wave_dash': '〰️',

    // Nature
    'sun_with_face': '🌞', 'sunny': '☀️', 'cloud': '☁️',
    'rainbow': '🌈', 'snowflake': '❄️', 'zap': '⚡',
    'ocean': '🌊', 'earth_americas': '🌎', 'earth_africa': '🌍',
    'earth_asia': '🌏', 'globe_with_meridians': '🌐',
    'crescent_moon': '🌙', 'full_moon': '🌕', 'new_moon': '🌑',

    // Animals
    'dog': '🐶', 'cat': '🐱', 'mouse': '🐭', 'hamster': '🐹',
    'rabbit': '🐰', 'fox_face': '🦊', 'bear': '🐻', 'panda_face': '🐼',
    'koala': '🐨', 'tiger': '🐯', 'lion': '🦁', 'cow': '🐮',
    'pig': '🐷', 'frog': '🐸', 'monkey_face': '🐵', 'chicken': '🐔',
    'penguin': '🐧', 'bird': '🐦', 'eagle': '🦅', 'owl': '🦉',
    'bat': '🦇', 'wolf': '🐺', 'horse': '🐴', 'unicorn': '🦄',
    'bee': '🐝', 'bug': '🐛', 'butterfly': '🦋', 'snail': '🐌',
    'worm': '🪱', 'lady_beetle': '🐞', 'ant': '🐜', 'spider': '🕷️',
    'crab': '🦀', 'octopus': '🐙', 'tropical_fish': '🐠', 'fish': '🐟',
    'whale': '🐳', 'dolphin': '🐬', 'shark': '🦈', 'turtle': '🐢',
    'snake': '🐍', 'dragon': '🐉', 'dragon_face': '🐲',
    'sauropod': '🦕', 't_rex': '🦖',

    // Food & Drink
    'apple': '🍎', 'green_apple': '🍏', 'pear': '🍐', 'tangerine': '🍊',
    'lemon': '🍋', 'banana': '🍌', 'watermelon': '🍉', 'grapes': '🍇',
    'strawberry': '🍓', 'blueberries': '🫐', 'melon': '🍈',
    'cherries': '🍒', 'peach': '🍑', 'mango': '🥭', 'pineapple': '🍍',
    'coconut': '🥥', 'kiwi_fruit': '🥝', 'tomato': '🍅', 'avocado': '🥑',
    'eggplant': '🍆', 'potato': '🥔', 'carrot': '🥕', 'corn': '🌽',
    'hot_pepper': '🌶️', 'broccoli': '🥦', 'garlic': '🧄', 'onion': '🧅',
    'mushroom': '🍄', 'peanuts': '🥜', 'chestnut': '🌰',
    'bread': '🍞', 'croissant': '🥐', 'pizza': '🍕', 'hamburger': '🍔',
    'fries': '🍟', 'hotdog': '🌭', 'taco': '🌮', 'burrito': '🌯',
    'sushi': '🍣', 'ramen': '🍜', 'spaghetti': '🍝', 'rice': '🍚',
    'curry': '🍛', 'stew': '🍲', 'popcorn': '🍿',
    'coffee': '☕', 'tea': '🍵', 'beer': '🍺', 'beers': '🍻',
    'wine_glass': '🍷', 'cocktail': '🍸', 'tropical_drink': '🍹',
    'champagne': '🍾', 'ice_cream': '🍨', 'cake': '🍰',
    'cookie': '🍪', 'chocolate_bar': '🍫', 'candy': '🍬',
    'lollipop': '🍭', 'doughnut': '🍩', 'pie': '🥧',

    // Travel & Places
    'car': '🚗', 'taxi': '🚕', 'bus': '🚌', 'ambulance': '🚑',
    'fire_engine': '🚒', 'police_car': '🚓', 'truck': '🚚',
    'rocket': '🚀', 'airplane': '✈️', 'helicopter': '🚁',
    'sailboat': '⛵', 'ship': '🚢', 'anchor': '⚓',
    'house': '🏠', 'office': '🏢', 'hospital': '🏥',
    'school': '🏫', 'church': '⛪', 'tent': '⛺',
    'mountain': '⛰️', 'volcano': '🌋', 'desert_island': '🏝️',

    // Activities & Sport
    'soccer': '⚽', 'basketball': '🏀', 'football': '🏈',
    'baseball': '⚾', 'tennis': '🎾', 'volleyball': '🏐',
    'golf': '⛳', 'ping_pong': '🏓', 'badminton': '🏸',
    'boxing_glove': '🥊', 'dart': '🎯', 'bowling': '🎳',
    'video_game': '🎮', 'joystick': '🕹️', 'slot_machine': '🎰',
    'game_die': '🎲', 'jigsaw': '🧩', 'chess_pawn': '♟️',
    'performing_arts': '🎭', 'art': '🎨', 'musical_note': '🎵',
    'notes': '🎶', 'microphone': '🎤', 'headphones': '🎧',
    'guitar': '🎸', 'musical_keyboard': '🎹', 'drum': '🥁',

    // Objects & Tools
    'bulb': '💡', 'flashlight': '🔦', 'computer': '💻',
    'keyboard': '⌨️', 'desktop_computer': '🖥️', 'printer': '🖨️',
    'mouse_computer': '🖱️', 'cd': '💿', 'dvd': '📀',
    'telephone_receiver': '📞', 'phone': '📱', 'iphone': '📱',
    'battery': '🔋', 'electric_plug': '🔌', 'mag': '🔍',
    'mag_right': '🔎', 'lock': '🔒', 'unlock': '🔓',
    'key': '🔑', 'hammer': '🔨', 'axe': '🪓',
    'wrench': '🔧', 'screwdriver': '🪛', 'nut_and_bolt': '🔩',
    'gear': '⚙️', 'link': '🔗', 'chains': '⛓️',
    'scissors': '✂️', 'pen': '🖊️', 'pencil2': '✏️',
    'memo': '📝', 'pencil': '📝', 'book': '📖',
    'books': '📚', 'notebook': '📓', 'clipboard': '📋',
    'calendar': '📅', 'pushpin': '📌', 'paperclip': '📎',
    'email': '📧', 'envelope': '✉️', 'package': '📦',
    'label': '🏷️', 'bookmark': '🔖',
    'money_with_wings': '💸', 'dollar': '💵', 'chart': '📊',
    'chart_with_upwards_trend': '📈', 'chart_with_downwards_trend': '📉',

    // Symbols
    'white_check_mark': '✅', 'ballot_box_with_check': '☑️',
    'heavy_check_mark': '✔️', 'x': '❌', 'negative_squared_cross_mark': '❎',
    'curly_loop': '➰', 'loop': '➿', 'part_alternation_mark': '〽️',
    'eight_spoked_asterisk': '✳️', 'eight_pointed_black_star': '✴️',
    'sparkle': '❇️', 'bangbang': '‼️', 'interrobang': '⁉️',
    'question': '❓', 'grey_question': '❔', 'grey_exclamation': '❕',
    'exclamation': '❗', 'heavy_exclamation_mark': '❗',
    'warning': '⚠️', 'no_entry': '⛔', 'no_entry_sign': '🚫',
    'o': '⭕', 'anger': '💢',
    'recycle': '♻️', 'white_flag': '🏳️', 'checkered_flag': '🏁',
    'triangular_flag_on_post': '🚩', 'crossed_flags': '🎌',
    'arrow_up': '⬆️', 'arrow_down': '⬇️', 'arrow_left': '⬅️',
    'arrow_right': '➡️', 'arrow_upper_right': '↗️', 'arrow_lower_right': '↘️',
    'arrow_upper_left': '↖️', 'arrow_lower_left': '↙️',
    'leftwards_arrow_with_hook': '↩️', 'arrow_right_hook': '↪️',
    'arrows_counterclockwise': '🔄', 'arrows_clockwise': '🔃',
    'back': '🔙', 'end': '🔚', 'on': '🔛', 'soon': '🔜', 'top': '🔝',
    'new': '🆕', 'free': '🆓', 'up': '🆙', 'cool': '🆒',
    'ok': '🆗', 'ng': '🆖', 'sos': '🆘',
    'information_source': 'ℹ️', 'abc': '🔤', 'abcd': '🔡',
    'symbols': '🔣', 'capital_abcd': '🔠', 'hash': '#️⃣',
    'zero': '0️⃣', 'one': '1️⃣', 'two': '2️⃣', 'three': '3️⃣',
    'four': '4️⃣', 'five': '5️⃣', 'six': '6️⃣', 'seven': '7️⃣',
    'eight': '8️⃣', 'nine': '9️⃣', 'keycap_ten': '🔟',

    // Flags (common)
    'flag-us': '🇺🇸', 'us': '🇺🇸', 'flag-gb': '🇬🇧', 'gb': '🇬🇧',
    'flag-ca': '🇨🇦', 'flag-au': '🇦🇺', 'flag-de': '🇩🇪', 'flag-fr': '🇫🇷',
    'flag-jp': '🇯🇵', 'flag-kr': '🇰🇷', 'flag-cn': '🇨🇳', 'flag-in': '🇮🇳',
    'flag-br': '🇧🇷', 'flag-mx': '🇲🇽', 'flag-es': '🇪🇸', 'flag-it': '🇮🇹',
    'flag-ru': '🇷🇺', 'flag-se': '🇸🇪', 'flag-nl': '🇳🇱', 'flag-ch': '🇨🇭',

    // Miscellaneous additions for common Mattermost usage
    'eyes': '👀', 'eye': '👁️', 'tongue': '👅', 'lips': '👄',
    'brain': '🧠', 'bone': '🦴', 'tooth': '🦷',
    'baby': '👶', 'child': '🧒', 'boy': '👦', 'girl': '👧',
    'man': '👨', 'woman': '👩', 'older_man': '👴', 'older_woman': '👵',
    'cop': '👮', 'construction_worker': '👷', 'princess': '👸',
    'angel': '👼', 'santa': '🎅', 'superhero': '🦸',
    'mage': '🧙', 'fairy': '🧚', 'vampire': '🧛', 'zombie': '🧟',
    'person_frowning': '🙍', 'person_shrugging': '🤷',
    'person_bowing': '🙇', 'person_facepalming': '🤦',
    'person_raising_hand': '🙋', 'person_tipping_hand': '💁',
    'speaking_head': '🗣️', 'bust_in_silhouette': '👤',
    'busts_in_silhouette': '👥', 'people_holding_hands': '🧑‍🤝‍🧑',
    'couple_with_heart': '💑', 'family': '👪',
    'footprints': '👣', 'luggage': '🧳',
    'umbrella': '☂️', 'closed_umbrella': '🌂',
    'dog2': '🐕', 'cat2': '🐈', 'mouse2': '🐁', 'ox': '🐂',
    'ram': '🐏', 'goat': '🐐', 'camel': '🐫', 'elephant': '🐘',
    'gorilla': '🦍', 'orangutan': '🦧', 'zebra': '🦓', 'deer': '🦌',
    'pig2': '🐖', 'rooster': '🐓', 'turkey': '🦃', 'dove': '🕊️',
    'flamingo': '🦩', 'parrot': '🦜', 'peacock': '🦚',
    'crocodile': '🐊', 'lizard': '🦎', 'dinosaur': '🦕',
    'whale2': '🐋', 'seal': '🦭',
    'rose': '🌹', 'tulip': '🌷', 'sunflower': '🌻', 'blossom': '🌼',
    'cherry_blossom': '🌸', 'hibiscus': '🌺', 'bouquet': '💐',
    'four_leaf_clover': '🍀', 'seedling': '🌱', 'herb': '🌿',
    'cactus': '🌵', 'palm_tree': '🌴', 'deciduous_tree': '🌳',
    'evergreen_tree': '🌲', 'fallen_leaf': '🍂', 'maple_leaf': '🍁',
    'leaves': '🍃', 'ear_of_rice': '🌾',
    'jack_o_lantern': '🎃', 'christmas_tree': '🎄', 'egg': '🥚',
    'ribbon': '🎀', 'sparkler': '🎇', 'firecracker': '🧨',
    'alarm_clock': '⏰', 'hourglass': '⌛', 'watch': '⌚',
    'timer_clock': '⏲️', 'stopwatch': '⏱️',
    'bell': '🔔', 'no_bell': '🔕',
    'mega': '📣', 'loudspeaker': '📢', 'mute': '🔇',
    'sound': '🔉', 'loud_sound': '🔊',
    'camera': '📷', 'camera_flash': '📸', 'video_camera': '📹',
    'movie_camera': '🎥', 'clapper': '🎬', 'tv': '📺',
    'radio': '📻', 'satellite': '📡',
    'hocho': '🔪', 'knife': '🔪', 'dagger': '🗡️', 'shield': '🛡️',
    'smoking': '🚬', 'coffin': '⚰️', 'urn': '⚱️',
    'amphora': '🏺', 'crystal_ball': '🔮',
    'prayer_beads': '📿', 'barber': '💈',
    'alembic': '⚗️', 'telescope': '🔭', 'microscope': '🔬',
    'candle': '🕯️', 'door': '🚪', 'bed': '🛏️',
    'couch_and_lamp': '🛋️', 'chair': '🪑', 'toilet': '🚽',
    'shower': '🚿', 'bathtub': '🛁', 'soap': '🧼',
    'sponge': '🧽', 'wastebasket': '🗑️',
    'atm': '🏧', 'put_litter_in_its_place': '🚮',
    'potable_water': '🚰', 'wheelchair': '♿',
    'mens': '🚹', 'womens': '🚺', 'restroom': '🚻',
    'baby_symbol': '🚼', 'wc': '🚾',
    'parking': '🅿️', 'no_smoking': '🚭',
};

/**
 * Look up a shortcode and return the Unicode emoji character.
 * Returns undefined if the shortcode is not a known system emoji.
 */
export function emojiFromShortcode(shortcode: string): string | undefined {
    return EMOJI_MAP[shortcode];
}

/**
 * Convert all `:shortcode:` patterns in a string to their Unicode emoji characters.
 * Unknown shortcodes are left as-is (they might be custom emojis).
 */
export function replaceShortcodes(
    text: string,
    customEmojiLookup?: (name: string) => { url: string } | undefined,
): string {
    return text.replace(/:([a-zA-Z0-9_+-]+):/g, (match, name: string) => {
        const unicode = EMOJI_MAP[name];
        if (unicode) { return unicode; }
        // If there's a custom emoji lookup and it matches, render as an img tag
        if (customEmojiLookup) {
            const custom = customEmojiLookup(name);
            if (custom) {
                return `<img src="${custom.url}" alt=":${name}:" title=":${name}:" class="inline-emoji" />`;
            }
        }
        return match; // Leave unknown shortcodes as-is
    });
}

/**
 * Get the full emoji map (for advanced usage like building search indexes).
 */
export function getEmojiMap(): ReadonlyMap<string, string> {
    return new Map(Object.entries(EMOJI_MAP));
}
