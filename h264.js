(function (exports) {

var H264 = {
	ExpGolomb: jBinary.Type({
		params: ['isSigned'],
		read: function () {
			var count = 0;
			while (!this.binary.read(1)) count++;
			var value = (1 << count) | this.binary.read(count);
			return this.isSigned ? (value & 1 ? -(value >> 1) : value >> 1) : value - 1;
		},
		write: function (value) {
			if (this.isSigned) {
				value <<= 1;
				if (value <= 0) {
					value = -value | 1;
				}
			} else {
				value++;
			}
			var length = value.toString(2).length;
			this.binary.write(length - 1, 0);
			this.binary.write(length, value);
		}
	}),

	Optional: jBinary.Type({
	    params: ['baseType'],
		read: function () {
			if (this.binary.read(1)) return this.binary.read(this.baseType);
		},
		write: function (value) {
			this.binary.write(value != null ? 1 : 0);
			if (value != null) {
				this.binary.write(this.baseType, value);
			}
		}
	}),

	ScalingList: jBinary.Template({
		init: function (size) {
			this.baseType = ['array', { /* TODO: implement scaling list */ }, size];
		}
	}),

	SPS: [
		'extend',
		{
			profile_idc: 'uint8',
			constraint_set_flags: ['array', 1, 8],
			level_idc: 'uint8',
			seq_parameter_set_id: 'ExpGolomb'
		},
		['if', function (context) { return [100, 110, 122, 244, 44, 83, 86, 118].indexOf(context.profile_idc) >= 0 }, {
			chroma_format: ['enum', 'ExpGolomb', ['MONO', 'YUV420', 'YUV422', 'YUV444']],
			separate_color_plane_flag: ['if', function (context) { return context.chroma_format === 'YUV444' }, 1],
			bit_depth_luma_minus8: 'ExpGolomb',
			bit_depth_chroma_minus8: 'ExpGolomb',
			qpprime_y_zero_transform_bypass_flag: 1,
			scaling_matrix: ['Optional', {
				scalingList4x4: ['array', ['ScalingList', 16], 6],
				scalingList8x8: ['array', ['ScalingList', 64], function () { return this.binary.getContext(1).chroma_format !== 'YUV444' ? 2 : 6 }]
			}]
		}],
		{
			log2_max_frame_num_minus4: 'ExpGolomb',
			pic_order_cnt_type: 'ExpGolomb',
			pic_order: ['if_not', 'pic_order_cnt_type', {log2_max_pic_order_cnt_lsb_minus4: 'ExpGolomb'}, [
				'if',
				function (context) { return context.pic_order_cnt_type === 1 },
				{
					delta_pic_order_always_zero_flag: 1,
					offset_for_non_ref_pic: ['ExpGolomb', true],
					offset_for_top_to_bottom_field: ['ExpGolomb', true],
					_num_ref_frames_in_pic_order_cnt_cycle: jBinary.Template({
						init: function () { this.baseType = 'ExpGolomb' },
						write: function (value, context) { this.binary.write(this.baseType, context.offset_for_ref_frame.length) }
					}),
					offset_for_ref_frame: ['array', ['ExpGolomb', true], function (context) { return context._num_ref_frames_in_pic_order_cnt_cycle }]
				}
			]],
			max_num_ref_frames: 'ExpGolomb',
			gaps_in_frame_num_value_allowed_flag: 1,
			pic_width_in_mbs_minus_1: 'ExpGolomb',
			pic_height_in_map_units_minus_1: 'ExpGolomb',
			frame_mbs_only_flag: 1,
			mb_adaptive_frame_field_flag: ['if_not', 'frame_mbs_only_flag', 1],
			direct_8x8_inference_flag: 1,
			frame_cropping: ['Optional', {
				left: 'ExpGolomb',
				right: 'ExpGolomb',
				top: 'ExpGolomb',
				bottom: 'ExpGolomb'
			}]
			// TODO: add VUI parameters
		}
	],

	NALUnit: jBinary.Type({
		read: function () {
			var sync = this.binary.read(['blob', 3]); // [0, 0, 1] or [0, 0, 0, 1]
			if (sync[2] === 0) this.binary.skip(1);
			var end = this.binary.view.byteLength;
			for (var i = this.binary.tell(); i < end - 4; i++) {
				var next = this.binary.read(['blob', 4], i);
				if (next[0] === 0 && next[1] === 0 && (next[2] === 1 || (next[2] === 0 && next[3] === 1))) {
					end = i;
					break;
				}
			}
			var data = this.binary.read(['blob', end - this.binary.tell()]);
			// TODO: ideally there should be Annex.B conversion from [0, 0, 3, X=0..3] to [0, 0, X]
			return data;
		}
	})
};

if (typeof module !== 'undefined' && exports === module.exports) {
	module.exports = H264;
} else {
	exports.H264 = H264;
}

})(this);